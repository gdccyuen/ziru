# Ziru Engine Anatomy — document intake & retrieval (verified edition)

> Draft v0.4 — verified directly against the code at commit HEAD of this repo.
> Paths are relative to core/ unless prefixed with the repo root. Line refs are
> pointers that will drift.

Companion docs: docs/SYSTEM-FLOWCHARTS.md (plain-English), this file (how the
machine actually works), and docs/MODULAR-ENGINE-DESIGN.md (proposal).

---

## 0. The one-paragraph model

**Intake** is a Job state machine driven by two processes — the API (creates and
admits Jobs, owns upload hand-off) and a Celery worker (parses, packages, and
**finalizes** a Job in one DB transaction). Finalization is also **publication**:
it writes the retrieval corpus — a documents row, its document_sections tree,
document_chunks rows whose text columns are pre-computed for search, plus a
keyword/entity graph in graph_nodes/graph_edges carrying the document
top_summary.

**Retrieval** never touches intake code. A query runs one of three routes
(small-corpus / classic keyword / agentic). The agentic route is a two-layer LLM
system: an outer **workflow** (planner + token wallet) fans out sub-query
**retrieve steps**, each running an inner **RetrievalAgent** that selects
documents from a knowledge-map overview, then per document runs a Collector
navigate loop over the section tree, hydrates the collected chunks, and returns
evidence + decision trace. The engine is evidence-only: final chat answers are
synthesized downstream in the chat service.

---

## 1. The corpus contract (intake writes → retrieval reads)

| Intake writes (table) | Written by | Read by at retrieval |
|---|---|---|
| documents (status, current_job_result_id, source_file_name, parse_track) | packages/shared-python/shared/services/retrieval/publication_service.py (publish_document_state) | scope resolution, discovery, KG overview, fallback |
| document_attributes (incl. built-ins createBy/createTime/fileHash/originalFile) | same, _replace_document_attributes | profile filters (API resolves to exclude_document_ids) |
| document_sections (path tree + summary per node) | publication_content.py (replace_document_revision_content) | agentic navigation (outline/summary per node), path search text |
| document_chunks (content + 5 precomputed text columns + 2 TSVECTOR columns) | publication_content.py | the 3 keyword channels + hydration |
| graph_nodes/graph_edges (doc node: properties.top_summary / top_keywords / top_entities; cross-doc related edges) | retrieval/graph/service.py (DocumentGraphService.publish_document_graph) | KG overview for LLM doc selection (agentic) |
| job_results + chunk rows + result ZIP on S3 | jobs/lifecycle/result_writer.py, worker upload | artifact delivery, MinerU raw re-parse |

**Denormalization is the design.** document_chunks carries five text fields
built at publication time by search/lexical_text.py:

- content_lexical_text, path_lexical_text — lexical (tokenized) forms
- content_search_text, path_search_text, term_search_text — search surfaces;
  section summaries fold into content/path search text
- content_search_tsv, path_search_tsv — Computed Postgres tsvector columns with
  GIN indexes (model models/database/document.py:154-169,192-201); ⚠ the keyword
  channels currently rank in Python and never read these tsv columns

Everything is keyed by (document_id, job_result_id) so a re-parse is a clean
revision replace (publication_content.py:106-120, delete-then-insert).

---

## 2. Intake pipeline (module by module)

### 2.1 API: job creation, admission, upload hand-off

- Route apps/api/app/api/v1/routes/jobs.py →
  apps/api/app/services/document_ingestion/service.py
  (DocumentIngestionService.create_v1_job/create_v2_job; v1 = chunk track,
  v2 = page-memory track).
- Validation (service.py:183-259): required file/URL fields; supported extensions
  from settings; webhook-URL pinning; URL file-type sniffing; API-version
  mode-selector enforcement.
- Scope resolution (service.py:261-313 + scope_service.py): document_id from
  metadata or generated; active-job conflict per (user, document).
- Admission: JobAdmissionService.enforce_job_capacity (MAX_CONCURRENT_JOBS,
  default 10).
- Creation (creation_service.py), upload confirmation (confirmation_service.py),
  worker dispatch (worker_dispatcher.py).

### 2.2 Job state machine (shared)

core/state_machine/states.py: pending → running → converting → done;
pending ⇄ waiting-file; any non-terminal → failed; failed → pending (retry).
service.py (async, API) and service_sync.py (sync, worker) do CAS transitions +
audit log + Redis cache sync.

### 2.3 Worker processing (Celery)

- Task parse_task: apps/worker/app/core/tasks/document_ingestion_tasks.py:104
  (name app.core.tasks.document_ingestion_tasks.parse_task); autoretry 120 s, max 2,
  only for RETRYABLE_EXCEPTIONS (timeout/unavailable/LLM/storage/Redis/MinerU);
  on_failure finalizes the Job as failed directly in the DB.
- processing_run.py DocumentProcessingRun.execute: context → mark_job_running
  (job-state gate: terminal=skip, waiting_file=retryable, running=redelivery
  under Redis lock) → temp workspace → download → page estimate → parse → result
  package → finalize_parse_success; records job_metadata.stages (timing_ms +
  token_usage).
- source_preparation.py: S3 verify/size (MAX_FILE_SIZE), download, sha256
  file_hash, archive original under objects/{document_id}/original/.
- page_estimator.py: pypdf pages / PPTX slides / words-per-500 / rows-per-50 …;
  never raises (falls back to page_count=1).
- parse_execution.py: doc_type-routed parse — page_memory track vs
  checkerboard_parse_output (MinerU path) — to ParseOutput(output_dir, parsed_df).
- parse_result_package.py: ParseArtifact + dataframe_to_chunks.
- Chunk conversion (services/chunks/dataframe_chunk_converter.py): row →
  {chunk_id, type(text|image|table|page), content, path, metadata, order}; typed
  metadata (keywords, entities, tokens, connect_to, page_nums, file_path) and
  cross-chunk connect_to embed links (chunk_connections.py).
- ZIP packaging (storage/zip_result_service.py): chunks.json, full.md,
  toc_hierarchies.json, debug/trace.json, debug/anatomy_map.json, images/,
  tables/, doc_nav.json, manifest.json (schema v2.0: job_id/data_id/source/
  processing{page_count, timing, stages}/statistics).

### 2.4 Summaries (connect_builder / summary_builder)

apps/worker/app/services/connect_builder/summary_builder.py operates on
doc_nav.json (parser-emitted or materialized from chunks via
ZipResultSchemaBuilder.build_doc_nav).

- Section summaries — recursive bottom-up (_recursive_summarize_nav, :282):
  leaves keep parser summary; each non-leaf becomes
  "This section covers: " + self_only + child titles truncated head/tail 100
  chars (_deterministic_section_summary). LLM opt-in (summary_use_llm, default
  off); when on, LLM only if contrib length exceeds SUMMARY_MAX_LEN=100.
- Top summary (_build_nav_top_summary + _llm_summarize): deterministic
  "This document includes: " + top-level titles; when top_summary_use_llm
  (default on) and content > 100 chars, one LLM call, prompt task file-summary
  (services/ai/prompt_service.py:1002), max_tokens 200, language-locked; LLM
  failure falls back to deterministic.
- build_section_summary_lookup → {section_path: summary}; that dict becomes
  document_sections.summary at publication.

### 2.5 Terminal finalization = one atomic transaction (worker, sync/gevent)

packages/shared-python/shared/services/jobs/lifecycle/service.py
(SyncJobLifecycleService.finalize_job_success, called from
apps/worker/app/services/document_ingestion/success_finalization.py:88):

1. result_writer.upsert_job_result + replace_chunks → job_results rows.
2. SyncJobPublicationFinalizer.publish_result →
   - RetrievalPublicationService.publish_document_state (upsert Document revision
     with _is_stale_document_completion guard, replace attributes,
     replace_document_revision_content for sections + chunks), then
   - publish_document_graph — recompute doc node + cross-doc related edges
     (keyword/entity overlap scoring), store top_summary.
3. State machine mark_completed (CAS).
4. Webhook outbox row.
5. Post-commit: retrieval cache invalidation
   (lifecycle/publication.py:85-99: redis.incr("retrieval:version")) and webhook
   dispatch.

Failure: finalize_job_failure → failed + webhook outbox.

---

## 3. Retrieval pipeline (module by module)

### 3.1 Entry and execution plan

- app_service.py run_retrieval_query: normalize query (query_normalization.py),
  then delegate.
- execution/plan.py RetrievalExecutionPlan.execute: empty-query filter → allowed
  chunk types + effective recall k → Redis cache read (versioned) →
  run_retrieval_route → cache write → hit-stats schedule → public projection.
  TODO at execution/plan.py:84: an Intent-Understanding pre-step is designed but
  not built.
- execution/routes.py run_retrieval_route chooses:
  1. small-corpus (scoped chunks ≤ top_k → return all, zero LLM)
  2. classic top-k (router_used=classic_topk)
  3. agentic (router_used=workflow_*)

### 3.2 Classic keyword route (verified)

**Shared scoped corpus** — one raw-SQL CTE (search/channels.py:21-55) joining
document_chunks + documents (active, current_job_result match) +
document_sections (LEFT) + job_results; selects content/path/term search-text
columns, source_file_name, section_path, job_id. exclude_document_ids =
document_id <> ALL(:ids); signal_paths and filter_mode (keep/delete) add
section-path LIKE clauses; exclude_sections is applied post-fetch in Python
(section_filters.py, exact or path + " / " prefix).

**Three channels** —
- path_channel, content_channel (_bm25_channel, channels.py:188-229): SQL only
  filters the pre-tokenized field non-empty, fetches **all** rows, then ranks in
  Python: rank_rows_by_bm25 whitespace-tokenizes, drops rows with no query-token
  overlap, BM25Okapi scores (lexical_ranker.py:14-50; token-count fallback).
- term_channel (channels.py:232-301): SQL LOWER(term_search_text) LIKE %token%
  OR per query token (raw substring), then Python rescore (full-query substring
  = 100.0 else token-presence count).

**Fusion & ranking** — merge_channels_rrf (scoring.py:42-68) dedupes by chunk_id,
weighted RRF (RRF_K=60; weights term 1.5 / path 1.0 / content 2.0);
merge_same_section_rows groups by document_id::section_path, joins content,
keeps max score. RRF writes score while rank_candidates_by_path (ranking.py:90-171)
reads discovery_score/agent_score — classic normalizes score → discovery_score
first (normalize_row_scores). Final rank mixes discovery rows with routed (agent)
rows, applies an importance multiplier from RetrievalHitStat (IQR/median →
sigmoid 0.1–2.0), splits primary vs fallback evidence, fills top_k
(ranking.py:150-167).

**Small-corpus** (scoped_corpus.py): ORM load of all scoped chunks with
score=1.0; rows omit the precomputed search-text fields, so they cannot share
downstream logic with channel rows.

### 3.3 Agentic route — outer workflow (query decomposition)

workflow/orchestrator.py WorkflowOrchestrator.run_request:

- Config from env (workflow/runtime_config.py): planner 4k, wallet total 200k,
  per-step 40k, max 5 steps, parallel 3 (RETRIEVAL_* knobs; deploy/.env raises
  bootstrap to 30k and per-step to 120k in practice).
- LLM planner (workflow/planner.py): decides single-step vs ≤ max_steps retrieve
  sub-queries with depends_on edges; fallback single step; each step charged to
  the planner bootstrap pool.
- BudgetWallet.allocate splits the wallet across steps; topological batches run
  with parallel_max concurrent RetrievalAgents (each own session + ledger);
  reclaimed between batches.
- Merge via WorkflowReferenceProjection (dedupe + API shape).
- TODO at workflow/orchestrator.py:133: outer workflow should become a real
  observe-act agent (evidence handoff between steps, adaptive sub-queries,
  global stop decisions).

### 3.4 Agentic route — inner RetrievalAgent (per sub-query)

agentic/orchestrator.py RetrievalAgent.run:

1. AgentState + BudgetLedger (pools: bootstrap / planning / context; per-doc
   caps weighted by chunk count).
2. Phase 1 — run_initial_discovery (agentic/discovery/phase.py):
   - bottom_discovery (keyword pass) → rows + per-doc section discovery signals.
   - kg_document_select: build KG overview (navigation/knowledge_map.py) and ask
     the LLM for a bare JSON list of document IDs (FILE_SELECT_PROMPT,
     agentic/prompts.py:11); validate IDs against overview + exclusions.
   - P1 ladder when empty: (a) one LLM-broadened restatement + re-run; (b) BM25
     top-docs fallback (no LLM). **No relevance gate in code today** (see §4).
3. Phase 2 — per selected doc, DocumentNavigationRunner
   (navigation/document.py, 1,329 lines — largest module).
4. Phase 3 — batch-hydrate collected paths, reconcile deferred image/table
   assets, trim evidence to context budget, emit AgenticResult.

### 3.5 navigate_step internals (what one LLM call sees)

agentic/navigation/tools.py:36-189: loads child sections for the current scope,
builds **legal actions** whose affordances depend on budget status and coverage
(actions.py:67-244: EXPAND blocked at EXHAUSTED, CRITICAL allows only critical
expands, TIGHT restricts to a top-3 allowlist; COLLECT IDs per visible item;
discovery hints become Dn collects; SEARCH S1/S2 only when the asset type is
enabled and present; FINISH always legal). Renders the **actionable
observation** (actions.py:357-475: each visible section once with counts, token
estimate, [Leaf] flag, 120-char summary previews; hard cap ~20k chars).

The response is parsed with tolerant JSON (parse_collector_response), action_id
must resolve to a legal action (mismatches corrected), COLLECT side effects are
validated and forced to outline when the same path is EXPANDed; the runner then
executes EXPAND/BACK/FINISH and asset tools.

Asset search (navigation/assets.py): SEARCH_IMAGES routes through a VLM with
presigned URLs (_search_images_via_vlm, text fallback); SEARCH_TABLES through a
text LLM; both judge candidates and reconcile against connect_to owner paths;
empty results block repeats per scope+type.

Evidence render/trim (agentic/evidence/builder.py, renderer.py): unified doc
tree render (outline items + leaf content + orphans), inline connect_to
table/image blocks, page ranges + PDF URL; trim_evidence_to_budget scores leaves
(confidence, discovery_score, importance), removes weakest first until remaining
× 0.9, mutating the in-memory trees.

### 3.6 Knowledge-map overview & section tree (verified queries)

- Overview (navigation/knowledge_map.py): active documents (current_job_result
  set, updated_at DESC, **limit 50**); chunk stats via join on
  current_job_result_id (total + non-text media count); graph doc nodes read
  only for properties.top_summary; one rendered line per doc (- [doc_id] name,
  chunks=N, optional media=N, indented top_summary); 🔍 discovery hints are
  injected later by _inject_discovery_signals.
- Section rows (navigation/section_tree.py): one SELECT of section_id / title /
  path / summary / sort_order for (document_id, job_result_id); virtual Root L1;
  scope items + depth-capped summarized children with chunk/image/table counts
  and char totals (section_counts.py: CASE counts, prefix aggregation,
  connected-asset counts via connect_to for zero-asset items).
- Coverage bookkeeping lives in NavigationState.collected_paths (not DB); a
  rejection ledger with reason strength (tool_adjudicated >
  navigational_abandon).

### 3.7 Budgets (unified governor across agentic)

agentic/core/budget.py BudgetLedger: bootstrap/planning/context pools; per-doc
soft caps; reserve → commit → refund; status thresholds HEALTHY <50% / TIGHT
≥50% / CRITICAL ≥80% / EXHAUSTED 0; low-priority calls refused at CRITICAL;
overdraft events; status block projected into every prompt. Env knobs
(agentic/core/runtime.py): MAX_NAV_STEPS 6, LATENCY_BUDGET_MS 30 000 (types.py
default 12 000 — mismatch), TOKEN_BUDGET_TOTAL 40 000, PLANNING_RATIO 0.5,
BOOTSTRAP_BUDGET 2 000 (raised to 30 000 in deploy/.env), PER_DOC_MIN_SHARE
1 500, INVENTORY_AWARE. AgentLlmBudget.call stringifies, estimates, reserves,
commits actual usage from current_llm_usage. See docs/RETRIEVAL-BUDGETS.md.

### 3.8 LLM plumbing (agentic side)

llm_adapter.py: create_retrieval_llm_fn (NORMAL_MODEL, temp 0.1, max 2048;
RETRIEVAL_LLM_THINKING → temp 0.0 + extra_body thinking),
create_retrieval_planner_fn (RETRIEVAL_PLANNER_MODEL else NORMAL_MODEL, temp 0.0,
max 8192), create_retrieval_vlm_fn (IMAGE_MODEL). Calls run through the sync
OpenAI-compatible client in asyncio.to_thread; usage lands in the
current_llm_usage ContextVar.

### 3.9 Hydration, public projection, cache, stats, traces (verified)

- assemble_retrieval_results (hydration/result_assembly.py:18-90): filter
  excludes + allowed chunk types, hydrate connect_to targets
  (hydration/connected.py), dedupe (drop rows embedded as another row connected
  target), compose per-type content (page = summary + snippets; table = [Table]
  summary/keywords/caption + connected images; text = content + connected
  parts), strip [images/...]/[SAME-AS ...] markers.
- Public projection (execution/response_projection.py:33-72): enrich asset URLs
  (hydration/assets.py), keep PUBLIC_RESULT_FIELDS (chunk_id, chunk_type,
  content, content_source, score, asset_url, source_chunk_path, file_path) +
  metadata + source. ⚠ internal citation is attached and cached but stripped
  from the public shape.
- evidence_text: classic/small render legacy grouped text (legacy_evidence.py);
  agentic joins per-step evidence_text blocks.
- Redis cache: version key retrieval:version; query key
  retrieval:query:v{version}:sha256(query|top_k|excludes|extra), TTL 300 s;
  workflow-plan cache TTL 600 s. **⚠ Verified bug: build_cache_extra returns
  llm_text_model/llm_vision_model keys that _cache_shape_digest rejects → every
  query-cache read/write raises TypeError, caught and ignored in plan.py — the
  query cache is effectively always a miss and never written.** user_id is not
  in the key; the workflow-plan cache (separate, valid params) still works.
- Hit stats (stats/service.py + recorder.py): fire-and-forget asyncio tasks
  upsert retrieval_hit_stats (document + chunk rows) via raw SQL ON CONFLICT;
  2 s drain; errors logged only.
- Trace: TraceRecorder (agentic/core/trace.py) — create_run writes a
  RetrievalRun row; decision-trace steps stream into the response as they
  happen; on complete, RetrievalStep rows flush and the run row is updated
  (retrieval_runs/retrieval_steps append-only models).

### 3.10 Downstream answer synthesis (chat, outside the engine)

apps/api/app/services/chat/chat_service.py: profile scope → exclude ids → engine
call → optional one more LLM call (_synthesis_answer_sync) writing the final
answer. Search returns engine evidence directly.

### 3.11 Caller surfaces and their defaults (verified)

| Surface | top_k default | Agentic default | Answer | Entry code |
|---|---|---|---|---|
| Chat (chat threads) | 8 (CHAT_TOP_K) | ON | synthesis downstream (on) | chat_service.py:43-47, 363-387 |
| REST POST /query | 10 (DEFAULT_TOP_K) | OFF unless client sets use_agentic | none | routes/retrieval.py:26-70, 164-175 |
| MCP retrieval.query | 10 | ON (hardcoded use_agentic=True) | none — agent contract returns evidence_text/referenced_chunks/decision_trace | mcp/retrieval_server.py:98-148 |

Notes: rerank is accepted on all surfaces but inert (no rerank pass exists).
The same TODO(intent-step) appears in execution/plan.py:84 and again in
mcp/retrieval_server.py:131-136 — the intent step is the engine seam the API
and MCP layers are already waiting for. So the flowchart default "Agentic ON"
is true for Chat and MCP, false for a raw REST /query call.

---

## 4. Verified doc-vs-code drift (SYSTEM-FLOWCHARTS.md vs code)

1. No relevance gate in the P1 ladder (flowchart node N): code = LLM select →
   broaden retry → BM25 fallback. docs/PLAN-FALLBACK-TUNING.md (recommended, NOT
   implemented) is where the gate is designed.
2. Answer synthesis is not part of the engine: engine answers carry
   answer_text=""; chat synthesis happens downstream.
3. Chunking/section-tree/summary work happens worker-side; summaries first go to
   doc_nav.json, then onto DB columns at publication.
4. Cache invalidation = global retrieval:version bump on any job completion —
   and the query cache itself is currently broken (see 3.9).
5. KG overview is rebuilt per query from graph_nodes (≤ 50 docs), not a
   maintained index.
6. Cross-doc graph edges exist at publication but only feed LLM doc selection
   indirectly via the KG overview — no graph-routing/expansion today.
7. BM25 runs in Python over pre-tokenized text columns; the computed Postgres
   TSVECTOR columns (and GIN indexes) are built but unused by the channels.

---

## 5. Friction points observed (input to modular-engine proposal)

1. navigation/document.py is a 1,329-line monolith (agent loop + asset
   sub-agent + tree mechanics + trace + prompt projection).
2. Two architecture TODOs in code: intent-understanding step
   (execution/plan.py:84 + mcp/retrieval_server.py:131), outer observe-act
   workflow (workflow/orchestrator.py:133).
3. Config sprawl: os.environ reads across workflow/runtime_config.py,
   agentic/core/runtime.py, settings.py, core/config/*, plus per-job parsing
   params and deploy/.env overrides; default mismatches (latency 12k vs 30k).
4. Prompts are Python string constants with duplicated tolerant-JSON parsers;
   no versioned templates. Budget-conditioned prompt rebuilding double-formats
   (tools.py:116-147); observation truncation can cut mid-line / drop action IDs.
5. Implicit contracts via dicts: ToolResult.payload, in-place-mutated
   ParseJobContext.job_metadata, GraphNode.properties JSON strings, raw 5-tuple
   section rows, score → discovery_score field mapping between fusion and
   ranking.
6. Two parallel corpus definitions (SQL CTE vs ORM small-corpus load) with
   different exclusion semantics; small-corpus rows omit search-text fields.
7. Async/sync twins of services (state machine, Redis, lifecycle) — deliberate
   for the gevent worker but duplicated.
8. Two parse tracks (chunk vs page_memory) share finalization but split code
   across huge modules (page_memory/ ≈5k lines).
9. _run_parse_job fuses download→estimate→parse→package→finalize;
   success_finalization hardcodes stored_count=0 / vectors_count=0 /
   delivery_mode=url.
10. Small correctness smells: BM25 fetches all rows into Python (no SQL
    pushdown); exclude_sections is post-fetch; cache bug (3.9); unused step arg
    in for_document; asset-filter budget recomputed from a fresh env read;
    evidence trim permanently mutates doc_trees; hit-stats not a durable queue.
11. ADRs bless thin adapters (0001), typed outcomes (0002), explicit retrieval
    policy objects (0003) — partially honored; the agentic engine is where
    typed-outcome discipline leaks most.

## 6. Open questions for the design phase

- ~~Which route/config knobs reach users?~~ → answered in §3.11 (Chat: agentic
  on; REST /query: agentic off by default; MCP: agentic hardcoded on).
- Should the cross-doc graph drive routing beyond the KG overview?
- Where should intent understanding live (pre-route filter, planner input, nav hint)?
- Should answer synthesis move into the engine as an optional stage?
- Where does the page-memory track fit in a modular intake pipeline?
