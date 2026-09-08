# Ziru.1 — Implementation Plan

> Draft for review. Companion to `docs/technical-design.md` (spec) and
> `docs/MODULAR-ENGINE-DESIGN.md` (module proposal). Informed by the measured
> baseline (`docs/research/modulised/BASELINE-FINDINGS.md`) and the bge-m3
> 4th-channel experiment (`docs/research/modulised/experiments/`).

## 0. Objective (what we want to achieve)

1. **Modern, compact UI** with **Bootstrap 5** and switchable skins.
2. **Unify** the current separate `webui` + `admin` into **one UI** with top tabs:
   - **Query** — for all users;
   - **User admin** — admin only;
   - **Attributes** — admin only;
   - **Jobs** — admin + librarian;
   - **Document Intake** — librarian (admin can also).
3. **Pack the intake module and the retrieval module into definite, limited
   interfaces** so each can be tested and optimised independently.

Non-goals: no new vector store beyond the embedding channel we add; BM25/RRF
math frozen unless the embedding experiment says otherwise; no per-user billing.

## 1. Current state (from the wire-and-measure baseline)

- Existing self-hosted Ziru fork runs (API `:5005`, worker, webui/admin,
  Postgres/Redis, MinerU `:8000`, Unsloth Studio `:8888`).
- SecDocs corpus ingested (23 PDFs, ~2070 chunks, one active doc/source).
- 55-query eval: **classic @8 = 18.2 %, @50 = 25.5 %**; **doc-recall @8 = 96 %, @50 = 100 %**.
- Root-cause decomposition:
  - Document selection is strong. Failure is **section-level alignment**
    (only 16/55 expected section paths present in DB) and **ranking depth**
    (correct evidence often at rank 13–43).
  - Chunk text evidence present in 50/55 — the content is indexed, just not
    surfaced at the right path/rank.
  - Table chunks are indexed by summary+keywords+caption, not `chunk.content`.
  - `G3_EN.pdf`-style sections are corrupted by TOC lines/long sentences
    becoming headings.
- Embedding experiment: adding **bge-m3** as a 4th RRF channel (weight **1.5**)
  lifts **@8 to 20.0 %** (+3 queries, 0 regressions, fixes the doc-recall miss)
  and is neutral at @50.
- OCR research: keep MinerU `pipeline` default; use **MinerU2.5-2509** via
  `vlm-engine` per-document for scan-heavy/atlas PDFs (local MLX, not Unsloth
  Studio). PaddleOCR-VL is a separate path — not wired into MinerU.

## 2. Guiding principles

1. **Policy vs mechanics.** Every module gets an explicit `Policy`/`RuntimeConfig`
   object; no `os.environ` reads inside stages or engine modules.
2. **Typed contracts at module edges.** No dict payloads across seams; typed
   outcomes per ADR 0002.
3. **Observe-act engine.** Corpus-level decisions live in one outer loop; inner
   per-document navigators are pluggable tools, not independent orchestrators.
4. **One metered LLM port.** All LLM/VLM calls go through `LLMPort`; usage
   reported to the budget governor.
5. **Trace is a first-class event stream** through one recorder; the public
   `decision_trace`/`retrieval_runs/steps` are projections of the same events.
6. **Corpus contract unchanged** (documents/sections/chunks/graph + job_results)
   so publication and clients survive the migration.
7. **Measured, not guessed.** Every phase has an acceptance check against the
   55-query eval (or a curated subset).

## 3. Unified UI (Phase 1 — quickest visible win)

### 3.1 Single app, top tabs

- Consolidate `admin/` + `webui/` into one Next.js/React app with a single
  responsive shell and a **top tab bar**.
- Tab visibility by role:

  | Tab | Roles |
  |---|---|
  | Query | all authenticated users |
  | User admin | administrator |
  | Attributes | administrator |
  | Jobs | administrator, librarian |
  | Document Intake | librarian (+ administrator) |

- Route-level guard falls back to the existing RBAC; a user who loads a
  non-permitted tab sees a "no access" panel, not a broken screen.

### 3.2 Bootstrap 5 + skin switching

- Replace the current UI theme with **Bootstrap 5** (rework the layout rather
  than patch the existing Next.js admin/webui CSS).
- **Skin switcher** = a small set of CSS-variable tokens (`--bs-primary`,
  surface colors, radius, density) persisted in `localStorage` and applied on
  `<html>`; provide light/dark + a couple of accent skins. Bootstrap 5 + CSS
  vars makes this cheap and maintainable.
- Keep the existing user-guide screenshots as the visual target; screenshot-diff
  the 5 tabs after the rebuild.

### 3.3 Data flow

- Tabs call the existing v1/v2 APIs first (jobs, documents, attributes, users,
  retrieval/chat) and are **thin wrappers** around stable endpoints, so we can
  swap the intake/retrieval internals behind them without touching the shell.

## 4. Intake module as a typed pipeline (Phase 2)

### 4.1 Stage seams

```text
Acquire → Estimate → Parse(track strategy) → Convert → Enrich → Package → Publish(one tx) → Effects queue
each stage: (JobView, StageInput) → StageOutput | StageFailure; stage.retryable(exc) maps to Celery
```

- Wrap existing worker stages as `Stage` implementations (**thin wrappers only —
  no behavioural change in parse track**).
- `JobView` replaces in-place `job_metadata` mutation; a typed `StageResult`
  carries side data.
- Drive the state machine from **stage outcomes**, not from inside stages;
  retry = new attempt id on the same Job row.

### 4.2 Intake quality fixes (from the baseline)

- **Heading reconstruction** — make it TOC-aware, drop page-number/TOC lines
  and long-sentence-as-heading noise (fixes `G3_EN.pdf`-style corruption), and
  **normalise the document-title root segment** so the section path matches
  the same convention the eval and the agent tree expect.
- **Section-path convention** — keep the path string as the single source of
  truth; materialise `document_sections` and `doc_nav.json` from it; specify one
  root/heading naming rule and apply it in both intake and eval.
- **Table chunk representation** — store the human-readable composed text
  (`summary + keywords + caption`) as the retrievable surface, so
  `chunk.content`-style grading and BM25/embedding both see it.
- **Parse track strategy** — a single strategy field: `pipeline` (default,
  deterministic) vs `vlm-engine` (scan-heavy/atlas), selected per document.
  `vlm-engine` uses the cached **MinerU2.5-2509** (local MLX); keep `pipeline`
  for clean/multilingual text.
- **Summaries** — deterministic section summaries by default, LLM top summary;
  both behind a typed `SummaryPolicy(summary_use_llm, top_summary_use_llm, max_len)`.
- **Compose search fields at publish** — content/path/term (+ `content_embedding`
  for the 4th channel) from content + summary + entities + section rollup.

### 4.3 Acceptance for Phase 2

- Intake produces section paths that match the eval's convention for the
  SecDocs corpus (target: expected-section-present rate rises well above 16/55).
- Re-parse of `G3_EN.pdf` yields a clean heading tree (no TOC-line headings).
- Eval chunk-substring evidence stays ≥50/55; embedding batch fills any gaps.
- Publish remains one DB transaction; no change to ZIP/DB/storage artifacts.

## 5. Retrieval module as an engine (Phase 3)

### 5.1 One request shape → one policy

- `RetrievalPolicy(top_k, recall_k=2×top_k, chunk_types, channels, channel_weights,
  mode, budget, synthesize)` + `ScopeFilter` (resolved once from profile/API route).
- Caller surfaces (Chat, REST `/query`, MCP) build the policy in the entry
  adapter; the engine is policy-driven.

### 5.2 CorpusGateway (one read model)

- `scoped_chunks`, `section_children`, `knowledge_map`, `assets`, `chunk_by_ids`.
- Search strategy pluggable behind `scoped_chunks` (BM25-in-Python today;
  optional Postgres TSV second strategy behind a flag).
- Exclusion/signal-path/filter-mode become SQL-level predicates, not post-fetch
  Python.

### 5.3 EngineLoop (observe-act)

- Outer loop owns corpus-level state (evidence, stop, step budget).
- Tools: `discovery`, `doc_select`, `navigate_doc`, `assets`, `hydrate`,
  `synthesize` (optional).
- Classic path = rules-only loop with `[discovery, hydrate]`; agentic = loop with
  LLM decisions. Keep the existing per-doc navigator as an inner tool (do not
  rewrite the Collector agent).

### 5.4 Add the bge-m3 4th channel (from the experiment)

- Add `embedding_channel` behind a flag (reuse the standalone experiment code)
  and fuse with weighted RRF, **embedding weight 1.5**.
- Use the local `gpustack/bge-m3-GGUF` (1024-dim) via `LLMPort`, service the
  embeddings endpoint; store `content_embedding` at publish (pgvector or
  OpenSearch k-NN).
- Acceptance: @8 pass-rate ≥ the 20.0 % measured (and ideally higher once
  section-path fixes land); zero retrievals regressions on the 55-query eval.

### 5.5 Budget governor, LLM port, trace

- One `BudgetGovernor` (RunBudget → StepWallet → PoolLedger) replacing
  `BudgetLedger`/`BudgetWallet`/`AgentLlmBudget`.
- Versioned prompt templates + tolerant parsers keyed by task.
- `TraceRecorder` as the single event-log write path; project
  `decision_trace`/`retrieval_runs/steps` from it.

## 6. Optimisation module (Phase 4)

- Implicit hit-stats + explicit feedback → Celery-beat batch:
  1. tune channel weights (per-request overrides, no redeploy);
  2. recompute decayed usage boost, sigmoid-mapped, **clamped to [0.1, 2.0]**;
  3. keyword re-alignment by recomposing search fields + reindex;
  4. dry-run report before any live weight change.
- Guardrails: bounded multipliers, append-only run/step logs.

## 7. Eval / acceptance harness (cross-cutting)

- Automate the 55-query SecDocs grading as a repeatable script (classic +
  hybrid @8/@50; doc/section/chunk/must-not checks) — extend the existing
  experiment harness so phase changes are measured in CI-style runs.
- Add a canonical **section-path mapping** between the eval spec and the corpus
  so false negatives from root-naming differences are removed.
- Contract tests (ADR 0001) for scope/exclusion crossing profiles (no content
  leak across profiles).

## 8. Rollout / migration

- Feature flags: `engine_v2`, `embed_channel`, `per_doc_vlm_backend`.
- Run new engine beside the current one; validate against a golden query set
  (top-k overlap, budget usage, trace shape) before switching the default.
- Keep the corpus/publication contract and the existing v1/v2 API shape stable.
- Once the unified UI + engine v2 are proven, deprecate the legacy orchestrator
  path and the separate admin/webui split.

## 9. Sequencing (suggested)

1. **Phase 1 — unified UI** (Bootstrap 5 + 5 tabs). Independent of engine; big
   visible win; calls existing APIs.
2. **Phase 2 — intake pipeline + heading/section-path fixes + per-doc
   `vlm-engine`**. Highest leverage on the measured weakness.
3. **Phase 3 — retrieval engine + bge-m3 4th channel**. Build the seams, land
   embedding channel, then the observe-act loop behind a flag.
4. **Phase 4 — optimisation batch job**.
5. **Phase 5 — deletes & docs** (retire legacy orchestrator, update
   SYSTEM-FLOWCHARTS, retire this draft).

## 10. Decisions to confirm before coding

1. **Fresh build in `ziru.1` vs incremental refactor of the frozen fork.**
   (Recommended: incremental refactor of the existing fork, because the corpus,
   ACL, eval, and baseline already exist; the modular design's P0–P5 map cleanly.)
2. **Search backend**: keep BM25-in-Python default, expose TSV behind a flag
   (recommended); benchmark before switching.
3. **Embedding storage**: pgvector `vector(1024)` vs OpenSearch k-NN
   (recommended: pgvector first, since it's single source of truth + already reserved).
4. **`vlm-engine` scope**: per-document opt-in only for scan-heavy/atlas
   (recommended), vs global change.
5. **Answer synthesis**: keep downstream for now, design the engine stage seam
   (recommended), enable later with one line.
6. **Unified UI framework**: single Next.js app reusing both ports (recommended),
   vs a smaller static shell.
