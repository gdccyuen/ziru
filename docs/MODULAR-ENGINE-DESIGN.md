# Ziru Modular Engine — design proposal

> Draft v0.1 — proposal only, nothing implemented yet. Companion to
> docs/ENGINE-ANATOMY.md (verified current behaviour). Terminology and file refs
> follow the anatomy doc.

## 0. Goals and non-goals

**Goals**

1. Turn intake and retrieval into two **typed pipelines** with explicit module
   seams, so stages can be swapped, tested, and instrumented independently.
2. Deliver the two architecture steps the code already asks for: an
   intent-understanding stage (execution/plan.py:84) and a true observe-act
   outer engine (workflow/orchestrator.py:133).
3. One **budget governor** and one **trace schema** across every LLM call of a
   turn (today: BudgetLedger + BudgetWallet + AgentLlmBudget + ad hoc token
   accounting in three places).
4. Fix verified defects as part of the rebuild: dead query cache, unused
   Postgres TSV columns, duplicated corpus read paths, env config sprawl.
5. Keep the **corpus contract** (documents/sections/chunks/graph + job_results)
   unchanged so publication and clients survive the migration.

**Non-goals**

- No new vector store, no semantic index, no change to BM25/RRF math unless a
  follow-up proposal says so (frozen, per flowchart glossary).
- No billing/quotas per user (on-prem, local LLM; budgets are guardrails).
- No rewrite of the parsers (MinerU track, page-memory track stay as adapters).

---

## 1. Principles

1. **Policy vs mechanics.** Every engine module receives an explicit Policy
   object; zero os.environ reads inside stages. Config is assembled once at the
   entry boundary into a validated RuntimeConfig + Policy.
2. **Typed contracts at module edges** (ADR 0002 already blesses this): no dict
   payloads crossing stage boundaries; ToolResult.payload and
   ParseJobContext.job_metadata go away as cross-module contracts.
3. **The engine observes then acts.** One outer loop owns corpus-level state:
   what evidence exists, whether to stop, whether to add steps. Inner workers
   (per-document navigator, asset inspector) are pluggable tools of that loop,
   not independent orchestrators.
4. **Every LLM call goes through the port.** A single metered LLM port (text /
   planner / vision) reports token usage to the governor. No module reads
   model env vars or calls the client directly.
5. **Trace is a first-class event stream** written through one recorder, with a
   stable schema, so response decision_trace, retrieval_runs/steps, and logs
   are projections of the same events.
6. **Read models are explicit.** Corpus reads (scoped chunks, section tree, KG
   overview) live behind a CorpusGateway with one exclusion/filter AST,
   replacing the duplicated CTE/ORM paths.
7. **Transaction boundaries own effects.** Intake finalization stays one DB
   transaction; post-commit effects become typed jobs on an effects queue.

---

## 2. Target architecture (module map)

```text
┌─ INTAKE (typed stage pipeline, Job-driven) ─────────────────────────────┐
│ Acquire → Estimate → Parse(track strategy) → Convert → Enrich → Package │
│     → Publish (one tx) → Effects queue (cache bump, webhooks)           │
│ each stage: (JobView, StageInput) → StageOutput | StageFailure          │
└─────────────────────────────────────────────────────────────────────────┘
                              │ writes corpus contract
                              ▼
     documents · document_sections · document_chunks · graph_nodes/edges
     document_attributes · job_results            (UNCHANGED schema)
                              ▲
┌─ RETRIEVAL (observe-act engine runtime) ────────────────────────────────┐
│ Entry: Normalize → Understand(intent) → [Cache] → EngineLoop            │
│ EngineLoop: observe(state) → decide → act(tool) → stop?                │
│   tools: plan-steps, discovery, doc-select, navigate-doc, assets,      │
│          hydrate, synthesize(optional)                                  │
│ Governor: run budget → step wallets → pool ledger (one implementation) │
│ Trace: EngineEventLog → decision_trace + retrieval_runs/steps          │
│ Output: project evidence + citations (+ answer when chat synthesis on) │
└─────────────────────────────────────────────────────────────────────────┘
```

Shared plumbing: CorpusGateway, LLMPort, BudgetGovernor, TraceRecorder,
Policy/Config models, EffectsQueue. Everything depends on these; nothing else
depends on parsers or prompt strings.

---

## 3. Part A — modular intake

### 3.1 Stage contracts (python-sketch)

```python
class Stage[I, O](Protocol):
    name: str
    async def run(self, ctx: StageContext, inp: I) -> O: ...
    def retryable(self, exc: Exception) -> bool: ...   # maps to Celery autoretry

class IntakePipeline:
    stages: list[Stage]  # Acquire, Estimate, Parse, Convert, Enrich, Package
    async def execute(self, job: JobView) -> IntakeOutcome: ...

# Outcomes carry reason, typed per ADR 0002
class PublishOutcome(Protocol): document_id: str; job_result_id: str
class EffectsPlan(Protocol): cache_invalidation: CacheBump; webhook: WebhookEvent
```

### 3.2 What becomes what

| Current | Target module | Change |
|---|---|---|
| source_preparation / page_estimator | intake/stages/acquire.py, estimate.py | thin Stage impls around existing logic |
| parse_execution + format routers + MinerU + page_memory | intake/stages/parse.py with a ParseTrack strategy (chunk / page_memory) | parse track = one strategy field, not scattered flags + lazy imports |
| dataframe_chunk_converter + chunk_connections | intake/convert.py (kept as-is) | typed Chunk row out (already typed) |
| connect_builder/summary_builder + doc_nav.json | intake/enrich.py with SummaryPolicy(summary_use_llm, top_summary_use_llm, max len) | same mechanics; policy object instead of job_metadata digging |
| zip_result_service + result_storage | intake/package.py (adapter) | unchanged |
| jobs/lifecycle/* + publication_* | intake/publish.py + effects/* | one tx; typed EffectsPlan; publication stays the corpus writer |
| job_metadata as message bus | StageContext carries a typed JobView (metadata read-only) | stops in-place mutation across stages; stages record side data via explicit StageResult extras |
| Celery retry semantics | stage-level retryable() | per-stage retry policy replaces one big task policy |

### 3.3 State machine

Keep pending ⇄ waiting-file → running → converting → done / failed as today,
but drive transitions from **stage outcomes**, not from inside stages: the
pipeline coordinator maps StageOutput/StageFailure → next transition and only
then calls the CAS state machine. Retry = new attempt id on the same Job row
(already supported by failed → pending).

---

## 4. Part B — modular retrieval engine

### 4.1 One request shape → one policy

```python
@dataclass(frozen=True)
class RetrievalPolicy:            # replaces RetrievalQuery + env knobs
    scope: ScopeFilter             # profile-derived filter AST, not exclude lists
    top_k: int = 8
    recall_k: int | None = None    # None → top_k * 2
    chunk_types: frozenset[str] = text/table/image/page
    channels: tuple[str, ...] = (term, path, content)
    channel_weights: dict[str, float] = term 1.5 / path 1.0 / content 2.0
    mode: EngineMode = AGENTIC     # SMALL_CORPUS_AUTO | CLASSIC | AGENTIC
    decomposition: DecompositionPolicy = AUTO (≤5 steps, parallel 3)
    budget: RunBudget = RunBudget(...)   # single validated object
    synthesize: bool = False        # chat turns set True (see 4.7)

@dataclass(frozen=True)
class EngineRequest: policy: RetrievalPolicy; query: str; caller: CallerContext
@dataclass(frozen=True)
class EngineResult: ...            # typed evidence + citations + trace ref
```

ScopeFilter: keep exclude_document_ids for API compatibility but resolve it
from a real filter AST (document_id ∈ / attributes ∈ / profile) once, in the
entry adapter; the engine then works on one canonical ScopeFilter object.

### 4.2 CorpusGateway (one read model)

```python
class CorpusGateway:               # replaces channels.py CTE + scoped_corpus ORM
    async def scoped_chunks(self, scope: ScopeFilter, recall_k: int) -> list[ChunkRow]: ...
    async def section_children(self, doc: DocRef, path: str) -> list[SectionItem]: ...
    async def knowledge_map(self, limit: int = 50) -> KnowledgeMap: ...
    async def assets(self, scope, asset_type, paths) -> list[AssetRow]: ...
    async def chunk_by_ids(self, ids) -> list[ChunkRow]: ...   # hydration
```

- ChunkRow is one typed row with the five search-text fields available
  everywhere (small-corpus rows currently omit them — see anatomy 3.2).
- Search strategy is pluggable behind scoped_chunks: today BM25-in-Python; the
  Postgres TSV columns become a second strategy (fixes the unused-GIN defect) —
  same gateway interface, benchmark before switching.
- exclude_sections / signal_paths / filter_mode become SQL-level predicates in
  the gateway, not post-fetch Python (anatomy friction 5.6).

### 4.3 EngineLoop — the observe-act outer runtime

This module replaces WorkflowOrchestrator and fixes its TODO:

```python
class EngineState:                 # one mutable state per request
    query: str; policy: RetrievalPolicy
    intent: Intent | None          # from Understand (4.4)
    plan: Plan | None; steps: list[StepState]
    evidence: EvidenceSet          # accumulated across steps
    governor: BudgetGovernor; events: EngineEventLog
    stop: StopReason | None

class EngineLoop:
    async def run(self, state: EngineState) -> EngineResult:
        while not state.stop:
            obs = await self.observe(state)        # read evidence/trace/ledger
            decision = await self.decide(state, obs)  # LLM or rules
            await self.act(state, decision)        # tool calls mutate state
            state.stop = self.check_stop(state)    # budget/latency/coverage/evidence
```

Decision policy: the loop itself decides **globally** (start more steps, add a
sub-query after weak evidence, stop when evidence suffices). Per-document
navigation and asset inspection remain inner agents invoked as tools — they
cannot start their own cross-document work (this is the current TODO intent).

- Tool registry: {discovery, doc_select, navigate_doc, search_assets, hydrate,
  synthesize}. Each tool declares schema, cost pool, and whether it mutates
  evidence.
- Compatibility: single-sub-query requests behave exactly like today one
  RetrievalAgent; the classic path is the loop with tools=[discovery, hydrate]
  and no LLM decisions (rules only).

### 4.4 Understand (intent) stage

Builds the module the code TODO already reserves (shared/services/retrieval/
intent/): one cheap LLM call (or rule fallback when disabled) returning typed
hints — document_hint, scope_hint, content_type_hint, intent_label (reuse
QUERY_INTENT labels). Output narrows scope (chunk types, signal paths, doc ids)
before planning; pure semantic queries skip everything. Runs inside the
bootstrap pool like doc selection; failure = UNKNOWN intent, no user-visible
change.

### 4.5 BudgetGovernor — one implementation

Merge BudgetWallet (workflow) + BudgetLedger (agent) + AgentLlmBudget into one
governor with three levels:

```text
RunBudget (per request)          ← env/deploy defaults, validated once
   └─ StepWallet (per step, allocate/reclaim)
        └─ PoolLedger (bootstrap/planning/context; per-doc soft caps)
```

- Reservation is exclusive: reserve before the LLM call, commit actuals from the
  port, refund on failure (mechanics already exist in BudgetLedger — keep them).
- All statuses (HEALTHY/TIGHT/CRITICAL/EXHAUSTED) are computed by the governor
  from ledger snapshots; prompts receive one formatted status block.
- Token estimates come from one estimator; the LLM port reports actuals
  (current_llm_usage stays but is owned by the port).
- Fix default mismatches (types.py 12 s vs env 30 s) — a single RuntimeConfig
  source of truth, no parallel defaults.

### 4.6 Cache — make it real and scoped

1. Fix the digest bug: remove llm_text_model / llm_vision_model from
   build_cache_extra or accept them in _cache_shape_digest (model changes MUST
   invalidate: include them deliberately).
2. Add caller scope to the key (document set or profile hash) — cache must not
   leak across profiles (anatomy 3.9).
3. Keep version-bump invalidation on publication (works) but scope invalidation
   per document when feasible; TTL 300 s stays.
4. Cache typed EngineResult at the boundary (projected public shape), never raw
   internal rows with citation objects.

### 4.7 Answer synthesis as an optional engine stage

Make chat synthesis (chat_service._synthesis_answer_sync) a pluggable
synthesize tool in the engine, enabled by policy.synthesize. Chat service
becomes a thin caller (scope resolution + policy); the engine owns evidence →
answer with citations in one trace. Search stays evidence-only. This moves the
flowchart node U into the engine without changing default behaviour.

---

## 5. Part C — LLM port and configuration

```python
class LLMPort(Protocol):          # one factory: text / planner / vision
    async def call(self, *, prompt: Prompt, pool: PoolRef,
                   temperature: float, max_tokens: int) -> LLMResponse: ...
# Prompt = {task, version, payload} — task templates versioned in one store
# LLMResponse = {text, usage, model, latency_ms}
```

- Prompt templates become versioned data (task + version), with a migration for
  the current inline templates (FILE_SELECT, RETRY_BROADEN, COLLECTOR,
  QUERY_INTENT, planner schema, file-summary) and their tolerant parsers move to
  one parsing module keyed by task.
- RuntimeConfig assembled once from env at entry; modules take it via
  dependency injection (tests stop setting env vars).

---

## 6. Part D — migration roadmap

**Phase 0 — corpus & cache hardening (no behaviour change)**
- Fix cache digest bug + scope key; enable TSV strategy behind flag; unify
  exclusion filtering in one module; delete dead code (unused tsv select etc.).
- Ship with the existing engine intact.

**Phase 1 — plumbing modules**
- Extract CorpusGateway over existing queries (CTE + ORM both call it).
- Introduce LLMPort wrapping llm_adapter + prompt registry + parser registry.
- Introduce RuntimeConfig; delete os.environ reads in retrieval modules.
- Trace: unify decision-trace construction behind TraceRecorder (already the
  write path — make it the only one).
- Accept: refactor only; behaviour identical (contract tests per ADR 0001).

**Phase 2 — budget governor**
- Replace BudgetLedger + BudgetWallet + AgentLlmBudget usages with the governor
  (same defaults). Delete old classes.

**Phase 3 — observe-act engine**
- Build EngineLoop + tools registry beside WorkflowOrchestrator; run both under
  a feature flag (engine_v2). Land the intent/Understand stage.
- Port the classic route to a rules-only loop with tools=[discovery, hydrate].
- Accept: v2 responses validated against v1 on a golden query set (top-k
  overlap, budget usage, trace shape).

**Phase 4 — intake stage pipeline**
- Wrap worker stages as Stage impls behind the same Celery task; coordinator
  maps outcomes to transitions; JobView replaces in-place job_metadata mutation.
- Accept: no change in ZIP/DB/storage artifacts.

**Phase 5 — deletes and docs**
- Delete the legacy orchestrator path, document.py monolith leftovers, and
  duplicated parsers; update SYSTEM-FLOWCHARTS to match; retire this draft.

### 6.1 Retrieval module mapping (current → target per phase)

| Current module | Target | Phase | Fate |
|---|---|---|---|
| execution/plan.py RetrievalExecutionPlan | engine/entry.py (normalize → understand → cache → EngineLoop) | P1/P3 | merge |
| execution/query_request.py RetrievalQuery | engine/policy.py RetrievalPolicy + ScopeFilter | P1 | convert |
| execution/routes.py run_retrieval_route | engine/entry.py route selection (SMALL_CORPUS_AUTO/CLASSIC/AGENTIC) | P1 | convert |
| workflow/orchestrator.py + planner.py + wallet.py | engine/loop.py EngineLoop + engine/planning.py + governor | P2/P3 | delete at P5 |
| agentic/orchestrator.py RetrievalAgent | engine/tools/doc_select.py + nav orchestration inside the loop | P3 | split |
| agentic/discovery/* (bottom_discovery, kg select, P1 ladder) | engine/tools/discovery.py + engine/gate.py (relevance gate per default 2) | P3 | port |
| agentic/navigation/document.py (monolith) | engine/tools/navigate_doc.py (loop) + nav/* (tree, state, actions) + trace/* | P1-P3 | split then delete shell |
| agentic/navigation/tools.py + actions.py + state.py + section_tree.py + section_counts.py | engine/nav/* (kept as inner-agent mechanics) | P1 | keep (re-homed) |
| agentic/evidence/* (builder, renderer) | engine/evidence.py | P1 | keep (re-homed) |
| agentic/core/budget.py + workflow/wallet.py + runtime.py AgentLlmBudget | engine/governor.py BudgetGovernor | P2 | merge, delete old |
| llm_adapter.py + prompt_service task strings + prompts.py parsers | engine/llm_port.py + prompts/ (versioned) + parsing/ | P1 | split |
| search/channels.py + lexical_ranker.py + scoring.py + ranking.py + scoped_corpus.py | corpus/gateway.py + corpus/search_bm25.py + corpus/search_tsv.py | P0/P1 | keep under new home; delete CTE/ORM duplication |
| hydration/* + response_projection.py | engine/output.py (assembly + projection) | P1 | keep (re-homed) |
| cache_service.py | engine/cache.py (fixed digest + scoped key) | P0 | rewrite in place |
| stats/* + retrieval_runs/steps models + TraceRecorder | engine/telemetry.py (event log + projections) | P1 | unify |
| graph/* (write) + knowledge_map.py (read) | corpus/graph.py + corpus/knowledge_map.py (cached overview) | P1 | keep (re-homed) |

---

## 7. Decisions the user should make

1. Scope of v2 engine: **replace** the workflow+agent layers wholesale (P3) or
   keep single-step RetrievalAgent as the default inner tool and only add the
   outer loop? (Recommended: keep the inner navigator, add the outer loop.)
2. Relevance gate (PLAN-FALLBACK-TUNING P3): fold into the P1 ladder as part of
   the engine build, or keep as a separate tuning follow-up?
3. Search backend: keep BM25-in-Python, or switch channel strategy to the
   Postgres TSV columns behind CorpusGateway (flag + benchmark)?
4. Answer synthesis in engine (4.7) vs stay downstream?
5. Corpus contract change tolerance: graph top_summary currently lives inside
   GraphNode.properties JSON — promote to a real column on documents? (Needed
   if the KG overview or graph routing becomes a maintained index.)

### 7.1 Proposed defaults (reviewer may approve wholesale or override per item)

| # | Proposed default | Implication for the roadmap |
|---|---|---|
| 1 | Keep the inner RetrievalAgent navigator; add the observe-act outer loop (do NOT rewrite the per-doc Collector agent) | Phase 3 = additive EngineLoop wrapping today single-step behaviour; lowest regression risk |
| 2 | Fold the relevance gate into the P1 ladder during the engine build (PLAN-FALLBACK-TUNING P3 mechanics: fallback top-3 by best RRF score, early stop after first evidence, gate when best score below RETRIEVAL_AGENTIC_FALLBACK_MIN_SCORE) | Part of Phase 3, gated on a ~15-question eval set before shipping |
| 3 | Keep BM25-in-Python as the default channel; expose the TSV strategy behind CorpusGateway behind a flag for benchmarking | Phase 0 adds the flag + benchmark harness; switch only if latency/quality wins measured |
| 4 | Keep answer synthesis downstream for now; design the engine stage seam (policy.synthesize) but leave it off | Phase 3 prepares the seam; enabling it later is a one-line policy change |
| 5 | Do NOT change the corpus schema yet; make KG overview reads tolerate a missing/renamed top_summary and cache the built overview per document | Revisit in a follow-up ADR once graph routing is on the roadmap |

## 8. Risks

- Phase 3 flag-running two engines doubles LLM cost during validation — bound
  it to a small eval set and log-only mode.
- Touching exclusion/cache logic can leak content across profiles — contract
  tests must include profile-scope cases (ADR 0001 style).
- Parsers are the largest untested surface; the intake refactor must not touch
  parse-track behaviour — stages are thin wrappers only.
