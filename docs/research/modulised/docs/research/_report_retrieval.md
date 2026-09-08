# Knowhere Retrieval System — Research Report

Repo: /Users/gordon/Documents/repos/knowhere (local clone of github.com/ontos-AI/knowhere). All paths below are relative to the repo root. Every claim cites file:line from the actual source; numeric constants are quoted verbatim.

---

## 1. Search channels and fusion

### 1.1 BM25, vector, or hybrid?

**Lexical-only: three BM25/substring channels, no vector search.** There is no embedding/cosine/ANN code anywhere in the retrieval service (grep for `embedding|cosine|vector` under packages/shared-python/shared/services/retrieval matches only a docstring in channels.py:158-160). The path-channel docstring states the design intent explicitly:

> "This keeps the channel useful when vector search is unavailable. A future vector score can be fused on top of the returned BM25 score." — packages/shared-python/shared/services/retrieval/search/channels.py:156-160

### 1.2 The three channels

All in packages/shared-python/shared/services/retrieval/search/channels.py:

| Channel | Function (line) | Indexed column | Scoring |
|---|---|---|---|
| **path** | `path_channel` (channels.py:143-173) | `document_chunks.path_search_text` (pre-tokenized, channels.py:172) | BM25Okapi |
| **content** | `content_channel` (channels.py:176-202) | `document_chunks.content_search_text` (pre-tokenized, channels.py:201) | BM25Okapi |
| **term** | `term_channel` (channels.py:253-326) | `document_chunks.term_search_text` (raw text, NOT tokenized, channels.py:294) | substring grep: full-query hit = 100.0, else matched-token count |

- All three run over one shared scoped-corpus SQL CTE, `_SCOPED_CORPUS_CTE` (channels.py:21-59): `document_chunks dc JOIN documents d ON d.document_id = dc.document_id AND d.current_job_result_id = dc.job_result_id`, filtered by `d.user_id = :user_id AND d.namespace = :namespace AND d.status = 'active'` (channels.py:53-55), optional exclusion via `AND d.document_id <> ALL(:excluded_doc_ids)` (channels.py:62-68, uses PG array ANY to dodge asyncpg tuple-binding issues per the comment at channels.py:65-67), plus optional chunk-type IN-filter and signal-path ILIKE filters (channels.py:86-120; signal paths are OR-combined keyword matches with a TODO for hierarchical prefix matching at channels.py:103-108).
- BM25 channel core, `_bm25_channel` (channels.py:205-250): tokenizes the query (channels.py:222), selects rows where the field is non-empty (channels.py:242), ranks with `rank_rows_by_bm25(rows, query_tokens, search_field=...)` and returns `ranked_rows[:top_k]` (channels.py:249-250).
- Term channel scoring (channels.py:313-326): if the lowercased full query is a substring of the row's term text → `row["score"] = 100.0`; otherwise `hit_count = sum(1 for u in query_tokens if u in haystack)` and `row["score"] = float(hit_count)` (channels.py:320-322). Sorted descending, truncated to top_k (channels.py:325-326).
- Channels are selectable per request via the `channels` list; default is all three: `active_channels = set(channels) if channels else {"path", "content", "term"}` — packages/shared-python/shared/services/retrieval/agentic/discovery/tools.py:66.

### 1.3 BM25 implementation details

packages/shared-python/shared/services/retrieval/search/lexical_ranker.py:
- `rank_rows_by_bm25` (lexical_ranker.py:14-50): per-row token list = whitespace split of the pre-tokenized field (lexical_ranker.py:73-74); rows are kept only if their token set intersects the query tokens (lexical_ranker.py:32-38); then `BM25Okapi(corpus)` from the third-party **rank-bm25** package (lexical_ranker.py:22, 43) and `scores = bm25.get_scores(query_tokens)` (lexical_ranker.py:44). **No custom BM25 parameters are passed**, so rank_bm25 defaults apply (k1=1.5, b=0.75).
- Fallback when rank_bm25 is missing: raw token-overlap count as the score (lexical_ranker.py:53-70, warning at lexical_ranker.py:59).
- Dependency: `"rank-bm25>=0.2.2"` — packages/shared-python/pyproject.toml:66; locked rank-bm25==0.2.2 (uv.lock:1561, 3459-3467; apps/worker/requirements.txt:421).

### 1.4 Fusion: weighted Reciprocal Rank Fusion

packages/shared-python/shared/services/retrieval/search/scoring.py:
- `merge_channels_rrf(channels, weights, top_k, k=RRF_K)` (scoring.py:42-68): for each channel row at 0-based rank r: `rrf_score = weight / (k + rank + 1)` (scoring.py:58), accumulated per chunk_id (scoring.py:59). Output rows are copies of the first-seen row with `score = round(fused_score, 6)` (scoring.py:67).
- Constants — packages/shared-python/shared/services/retrieval/settings.py:3-8:
  - `CHANNEL_WEIGHT_PATH = 1.0` (settings.py:3)
  - `CHANNEL_WEIGHT_CONTENT = 2.0` (settings.py:4)
  - `CHANNEL_WEIGHT_TERM = 1.5` (settings.py:5)
  - `INTERNAL_RECALL_K_MULTIPLIER = 2` (settings.py:6)
  - `RRF_K = 60` (settings.py:7)
  - `DEFAULT_TOP_K = 10` (settings.py:8)
- Weights are overridable per request: `effective_weights = {**default_weights, **(channel_weights or {})}` — packages/shared-python/shared/services/retrieval/agentic/discovery/tools.py:114-119; only channels that returned rows participate in fusion (discovery/tools.py:121-131).
- Post-fusion steps inside `bottom_discovery` (agentic/discovery/tools.py:40-180):
  - fuse with `merge_channels_rrf(channel_lists, weight_list, effective_recall_k)` (discovery/tools.py:133-137)
  - `merge_same_section_rows(fused_rows)` — merges rows sharing `document_id::section_path`, joins content with newlines, keeps max score (scoring.py:13-39; call at discovery/tools.py:138)
  - `normalize_row_scores(..., source_field="score", target_field="discovery_score", default=0.5)` — min-max normalization into [0,1], flat 0.5 when all scores equal (scoring.py:71-94; call at discovery/tools.py:140-146)
  - `top_doc_ids`: top **5** documents by number of fused rows (discovery/tools.py:148-157).

### 1.5 Internal recall depth

- Effective per-channel recall k = `internal_recall_k if internal_recall_k is not None else top_k * INTERNAL_RECALL_K_MULTIPLIER` — i.e. **2× top_k** by default (execution/query_request.py:104-107; workflow/run_request.py:68-71; discovery/tools.py:61-65). Fusion then truncates to the same effective_recall_k (discovery/tools.py:134), and final ranking truncates to top_k (see §3.4).

---

## 2. Query expansion

### 2.1 There is NO LLM-based keyword extraction of user queries

Grep for keyword-extraction prompts in the retrieval service finds only ingest-side functions over chunk metadata (graph/keywords.py:21-34, graph/service.py:86). The user query reaches BM25 **unmodified except tokenization**; the only LLM-driven "expansion" is sub-query decomposition in the workflow planner (§2.3) and intent classification (§2.4).

### 2.2 Tokenization (the actual pre-search expansion)

- Query-side: `tokenize_query_for_ranker(query)` = `tokenize_for_retrieval(query, dedupe=True)` — packages/shared-python/shared/services/retrieval/search/lexical_ranker.py:10-11.
- `tokenize_for_retrieval` — packages/shared-python/shared/utils/text_utils.py:245-279:
  - strips chunk-reference markers first via `_CHUNK_MARKER_RE` (text_utils.py:180-183, applied at text_utils.py:258)
  - splits text into CJK vs non-CJK segments (text_utils.py:193-210)
  - CJK segments: **OpenCC traditional→simplified normalization** (`_T2S_CONVERTER = _OpenCC("t2s")`, text_utils.py:22-26, applied in `_tokenize_cjk_segment` text_utils.py:221-228) then **jieba** `lcut` (text_utils.py:224-228; jieba imported at text_utils.py:53). Purpose per docstring: "lets BM25 cross-match 繁/简 variants" (text_utils.py:29-36).
  - English segments: **blingfire** `text_to_words` when available, else syntok tokenizer (text_utils.py:15-18, 213-218)
  - filters: tokens must contain CJK/English/number chars and be **length ≥ min_token_length = 2** (default, text_utils.py:250; filter at text_utils.py:264-274); single-char tokens dropped as noise (text_utils.py:126-134)
  - stopword filtering: default stopword list from `shared.core.constants.stopwords.DEFAULT_STOPWORDS`, split into zh/en sets (text_utils.py:148-176, 231-242); English lowercased (text_utils.py:186-190)
  - optional order-preserving dedupe (text_utils.py:277-278)
- Corpus-side uses the same pipeline via `tokenize_contents_for_retrieval` (text_utils.py:282-301) — see §3.1 for which fields it builds.

### 2.3 LLM sub-query decomposition (workflow/agentic path only)

packages/shared-python/shared/services/retrieval/workflow/planner.py:
- Prompt `_PLANNER_PROMPT` (planner.py:33-62), key excerpt:
  > "Decide whether the query needs decomposition into multiple sub-queries. Most queries are single-step (return a 1-step plan with the original query). Only decompose when: - The query asks for a comparison across distinct entities/time periods - The query asks for a derived computation that requires multiple facts - The query bundles 2+ independent informational asks"
  Hard constraints in the prompt: `max_steps`, per-step token cost, "final_strategy must be concat_final_parts", "step_kind must be retrieve", "KNOWHERE returns evidence only; do not plan answer synthesis steps" (planner.py:47-54). Sub-queries must stay in the user's original language (planner.py:61).
- Output schema (planner.py:18-31): `{reasoning_summary, steps: [{id, sub_query, step_kind, depends_on, output_role, top_k}], final_strategy}`. Each step may carry its own `top_k` and `chunk_types` (planner.py:179-190).
- Fallbacks: no LLM → single-step plan with reason "planner_llm_unavailable" (planner.py:90-91); any parse/validate error → single step, planner_status="fallback" (planner.py:113-118).
- The planner runs with a thinking-mode LLM (`create_retrieval_planner_fn(thinking=True)`, workflow/orchestrator.py:110) and its own budget ledger (workflow/orchestrator.py:112-117; budgeted call at planner.py:131-155).
- Per-step execution: `WorkflowRunRequest.for_step(step)` substitutes `query=step.sub_query`, `top_k = step.top_k or self.top_k`, `chunk_types = step.chunk_types or self.chunk_types`, and recomputes internal_recall_k = step_top_k × 2 (workflow/run_request.py:49-71).

### 2.4 Query intent classification (navigation advisory, not search terms)

- `QUERY_INTENT_PROMPT` — packages/shared-python/shared/services/retrieval/agentic/prompts.py:105-119; labels: MACRO_SUMMARY, STRUCTURE_OVERVIEW, FACTUAL_DETAIL, NUMERIC_DETAIL, ASSET_LOOKUP, UNKNOWN (prompts.py:122-129). Used to bias outline-vs-full collection in the navigation prompt (prompts.py:69-77) and outline allowance in CRITICAL budget mode (navigation/tools.py:236-239).

### 2.5 Discovery hints fed back into LLM document selection

BM25 results are turned into per-document "🔍 Discovery hints" section-path lists and injected into the file-selection prompt as soft signals — packages/shared-python/shared/services/retrieval/agentic/discovery/phase.py:78-79, 98-124 (`build_discovery_signals`) and agentic/discovery/tools.py:218-222, 295-329 (`_inject_discovery_signals`, max 5 paths per doc, tools.py:299). The FILE_SELECT_PROMPT tells the LLM: "Consider them as additional signals but make your own judgment" (agentic/prompts.py:17-19).

### 2.6 Deliberate non-expansion for asset search

SEARCH_IMAGES/SEARCH_TABLES always use the **original** user query; model-generated rewrites are intentionally ignored — agentic/prompts.py:182-189 ("We intentionally ignore model-generated query rewrites here so navigation cannot silently broaden or narrow the asset inspector's task") and navigation/tools.py:308-312 (`"query": query.strip()`).

---

## 3. Field indexing and boosting

### 3.1 What goes into each search field (built at publication time)

Call site — packages/shared-python/shared/services/retrieval/publication_content.py:138-168 (`_build_document_chunk`):
- `content_search_text = build_content_search_text(chunk, section_summary=section.summary)` (publication_content.py:153-156)
- `path_search_text = build_path_search_text(source_file_name=..., section_path=..., section_title=..., section_summary=...)` (publication_content.py:157-162)
- `term_search_text = build_term_search_text(chunk, path_text=f"{source_file_name} {section_path}")` (publication_content.py:137, 163)
- plus legacy `content_lexical_text` / `path_lexical_text` columns (publication_content.py:148-152).

Field builders — packages/shared-python/shared/services/retrieval/search/lexical_text.py:
- **content field** (`build_content_search_text`, lexical_text.py:113-140): joins chunk content + node-level summary (`metadata.summary` or `chunk.summary`, lexical_text.py:143-147) + flattened typed-entity surface forms (`metadata.entities[].text`, lexical_text.py:150-163) + optional section rollup summary (lexical_text.py:136-137), then tokenizes with `tokenize_contents_for_retrieval([raw], stopwords=[], link_char=" ")` (lexical_text.py:139). Note **stopwords=[] → no stopword removal in stored search text**. Docstring notes this closes the "VLM summary 未入 content_search_text" gap (lexical_text.py:120-124).
- **path field** (`build_path_search_text`, lexical_text.py:166-183): source_file_name + section_path + section_title + section_summary, same tokenization.
- **term field** (`build_term_search_text`, lexical_text.py:186-200): raw (NOT tokenized) `f"{content} {path}"` for the grep channel.
- **Table chunks** use summary + keywords + caption instead of raw content in all three builders (`_table_search_source_text`, lexical_text.py:208-230; table detection lexical_text.py:203-205).
- `build_lexical_text` (lexical_text.py:42-50) stores original text + tokenized variant newline-joined (used for the legacy lexical columns).

### 3.2 Channel weights / boosts (per channel)

- path **1.0**, content **2.0**, term **1.5** — settings.py:3-5 (quoted in §1.4); overridable via request `channel_weights` (discovery/tools.py:114-119).
- Term-channel intrinsic boost: exact full-query substring match scores **100.0**, dwarfing token-hit counts (channels.py:316-322).

### 3.3 Hit-count / importance scoring (per chunk)

packages/shared-python/shared/services/retrieval/stats/service.py:
- Constants (stats/service.py:11-13): `_HALF_LIFE_DAYS = 30.0`, `_ALPHA = 0.7`, `_BETA = 0.3`.
- `compute_importance_score(hit_count, last_hit_at, created_at)` (stats/service.py:23-28):
  - usage heat: `hit_count * exp(-0.693 * days_since_last_hit / 30.0)` (`_decay_score`, stats/service.py:16-20)
  - freshness: `1 * exp(-0.693 * days_since_created / 30.0)` (stats/service.py:27)
  - score = `round(0.7 * usage_heat + 0.3 * freshness, 4)` (stats/service.py:28)
- Hit stats are upserted after every retrieval (cache hits included) into table `retrieval_hit_stats` with hit_kind 'document' and 'chunk' — SQL upserts at stats/service.py:31-57; per-result recording at stats/service.py:85-121; scheduled fire-and-forget via asyncio task in packages/shared-python/shared/services/retrieval/stats/recorder.py:25-38 (drain helper recorder.py:41-57).

### 3.4 Importance multiplier and final candidate ranking

packages/shared-python/shared/services/retrieval/search/ranking.py:
- `load_chunk_importance_scores` (ranking.py:23-55): loads RetrievalHitStat rows with `hit_kind == 'chunk'` for candidate chunk_ids.
- `apply_importance_multiplier(rows, raw_field='importance_raw_score', low=0.1, high=2.0)` (ranking.py:58-91): computes median and IQR of the raw importance values across candidates; per row `z = (raw - median)/iqr`, `sigmoid = 1/(1+exp(-z))`, `multiplier = low + (high - low) * sigmoid` → **multiplier ∈ [0.1, 2.0]** (ranking.py:62-83); degenerate IQR → multiplier 1.0 (ranking.py:77-78). Multiplied into both `agent_score` and `discovery_score` (ranking.py:84-91).
- `rank_candidates_by_path` (ranking.py:94-175): merges discovery rows and routed/agent rows keyed by section path (`path:<section_path>`) else chunk_id (ranking.py:15-20); when agent results exist, candidates with `agent_score <= 0.0` go to a fallback list (ranking.py:154-157); primary sort key = **`(agent_score, discovery_score, -insertion_order)`** (ranking.py:159-166); fallback rows top up the remainder of top_k (ranking.py:169-171).
- `evidence_score` = agent_score when agent results exist, else max(discovery_score, agent_score) (ranking.py:150-151).

### 3.5 Agentic evidence budget trimming (importance as tie-breaker)

packages/shared-python/shared/services/retrieval/agentic/evidence/builder.py, `trim_evidence_to_budget` (builder.py:226-301):
- target = `int(context_remaining * safety_margin)` with **safety_margin = 0.9** (builder.py:235, 238)
- each collected leaf section is scored by the tuple **`(confidence, discovery_score, importance)`** where confidence is the LLM's COLLECT confidence and importance = max `compute_importance_score` over its chunks (`_fetch_importance_norm_scores`, builder.py:193-223; score assembly builder.py:260-270)
- lowest-scored sections are popped until under budget (builder.py:274-293).

### 3.6 Document knowledge graph: keyword/entity index and edge weights

packages/shared-python/shared/services/retrieval/graph/keywords.py constants (graph/keywords.py:7-12):
```python
MIN_KEYWORD_OVERLAP = 3
KEYWORD_SCORE_WEIGHT = 1.0
MIN_SCORE_THRESHOLD = 0.8
MIN_ENTITY_OVERLAP = 2
```
- Document-level TF-IDF keywords, top **10**: score = `freq * (log(total / df) + 1)` — `compute_tfidf_keywords` (graph/keywords.py:100-126).
- Keyword overlap edge score = character-length-weighted shared/min weight: `weight * sum(len(shared)) / min(sum(len(a)), sum(len(b)))` — `compute_keyword_score` (graph/keywords.py:129-142); typed-entity variant `compute_entity_score` (graph/keywords.py:80-97).
- Edge creation in `DocumentGraphService.publish_document_graph` — packages/shared-python/shared/services/retrieval/graph/service.py:70-202: document node stores top_keywords/top_entities/chunks_count/types/top_summary (graph/service.py:127-148); edges only when shared entities ≥ 2 with score ≥ 0.8 (`edge_basis='entities'`, graph/service.py:219-238) or, as fallback, shared keywords ≥ 3 with score ≥ 0.8 (`edge_basis='keywords'`, graph/service.py:240-270); edge `weight = round(score, 4)` (graph/service.py:192).
- These edges power the document-level KG overview consumed by LLM document selection (agentic/navigation/knowledge_map.py via build_knowledge_map_overview, called at agentic/discovery/tools.py:197-201).

### 3.7 Other numeric boosts/confidences in the agentic path

- LLM-selected documents get hardcoded `confidence = 1.0`, reason "LLM selected from KG overview" (agentic/discovery/tools.py:263-272).
- COLLECT default confidence **0.7** (agentic/prompts.py:168, 172; navigation/tools.py:235); EXPAND drill-in recorded with confidence **0.8** (navigation/tools.py:272-275).

---

## 4. Agentic retrieval (workflow + DAG + navigation)

### 4.1 Routing into agentic mode

packages/shared-python/shared/services/retrieval/execution/routes.py, `run_retrieval_route` (routes.py:23-33):
1. **small-corpus shortcut**: if total scoped chunk count ≤ top_k, return all chunks unranked, router "small_corpus_all" (routes.py:36-97).
2. **agentic route** only when `context.use_agentic is True` (routes.py:30) → WorkflowOrchestrator (routes.py:160-170).
3. otherwise **classic top-k**: bottom_discovery → rank_retrieval_candidates → assemble, router "classic_topk" (routes.py:100-157).

`use_agentic` is a per-request parameter defaulting to None (execution/query_request.py:33; app_service.py:34). AGENTS.md:560 mentions a global `RETRIEVAL_AGENTIC_ENABLED` env flag, but that name appears **only** in AGENTS.md — no code reference exists in packages/ or apps/.

### 4.2 Workflow layer (planner + DAG)

packages/shared-python/shared/services/retrieval/workflow/:
- **Orchestrator** (workflow/orchestrator.py:38-204): builds LLM fns (navigation llm fn workflow/orchestrator.py:109; planner fn with thinking=True, workflow/orchestrator.py:110), loads corpus inventory (workflow/orchestrator.py:118-125), gets a plan via `WorkflowPlanService.load_or_create` (Redis-cached; workflow/plan_service.py:16-72), allocates per-step budget ledgers from a `BudgetWallet` (workflow/orchestrator.py:147-151), then executes the DAG in **topological batches**: steps within a batch run concurrently via `asyncio.gather` under `asyncio.Semaphore(config.parallel_max)` (workflow/orchestrator.py:153, 159-172); wallet reclaims unused budget per completed step (workflow/orchestrator.py:173-174). Results are deduped across steps by `WorkflowReferenceProjection` (workflow/orchestrator.py:178-182). Router label: "workflow_decomposed" if >1 step else "workflow_single_step" (workflow/orchestrator.py:194).
- **DAG types** (workflow/types.py): PlannedStep = {id, sub_query, step_kind="retrieve", depends_on[], output_role ∈ {final_part, intermediate}, top_k?, chunk_types?} (types.py:14-41); QueryPlan.validate() enforces unique ids, known deps, only "retrieve" steps (types.py:114-133); `topological_batches()` (types.py:135-152) raises on cycles.
- **Step runner** (workflow/step_runner.py:22-96): each step runs a full **RetrievalAgent** (`self._agent_factory().run(...)`, step_runner.py:64-82) with its own sub_query/top_k and a per-step BudgetLedger; step status mapping done/budget_stop/not_found at step_runner.py:99-105.
- **Workflow budget config** (workflow/runtime_config.py:8-24), all env-overridable:
  - `planner_budget = 4000` ← RETRIEVAL_PLANNER_THINKING_BUDGET
  - `wallet_total_budget = 200000` ← RETRIEVAL_WALLET_TOTAL_BUDGET
  - `per_retrieve_step_budget = 40000` ← RETRIEVAL_WALLET_PER_RETRIEVE_STEP_BUDGET
  - `max_steps = 5` ← RETRIEVAL_DECOMPOSITION_MAX_STEPS
  - `parallel_max = 3` ← RETRIEVAL_WORKFLOW_PARALLEL_MAX
- **Wallet** (workflow/wallet.py:29-137): each step requests max(per_retrieve_step_default, _RETRIEVE_FLOOR) with **_RETRIEVE_FLOOR = 4000** (wallet.py:12); if total demand exceeds the wallet it scales down proportionally, never below the floor, then trims largest allocations to respect the hard cap (wallet.py:50-89). Per-step ledgers inherit planning_ratio=0.5 (RETRIEVAL_AGENTIC_PLANNING_RATIO), bootstrap_budget=2000 (RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET), per_doc_min_share=1500 (RETRIEVAL_AGENTIC_PER_DOC_MIN_SHARE) — wallet.py:36-44.

### 4.3 Agentic layer (per-step RetrievalAgent)

packages/shared-python/shared/services/retrieval/agentic/orchestrator.py (`RetrievalAgent.run`, lines 65-431). Module docstring (agentic/orchestrator.py:1-15): "Phase 1: Document selection (bottom_discovery + kg_document_select); Phase 2: Per-document navigation (iterative BFS via navigate_step); Phase 3: Render evidence text for downstream agents... KNOWHERE does not generate final answers."

- **Phase 1 — discovery + document selection** (agentic/discovery/phase.py:17-95):
  - `bottom_discovery` — the same 3-channel BM25+RRF as classic mode (discovery/tools.py:40-180), so channel search is always the foundation even in agentic mode.
  - discovery rows → per-doc section-path "signals" (phase.py:79) → `kg_document_select` (discovery/tools.py:183-292): builds a document-level KG overview (`build_knowledge_map_overview`, discovery/tools.py:197-201), injects discovery hints (discovery/tools.py:219-222), asks the LLM via FILE_SELECT_PROMPT (agentic/prompts.py:11-30) to return a JSON array of document IDs, validates against known doc ids minus excludes (discovery/tools.py:232-237).
  - If no LLM or zero docs selected → returns discovery-only results with router "agentic_discovery_only" and stop_reason "no_documents_selected" (agentic/orchestrator.py:166-255).
- **Phase 2 — per-document navigation** (agentic/navigation/document.py):
  - `navigate_selected_documents` (document.py:86-95): classifies query intent once, then navigates each selected document sequentially until the latency budget is hit.
  - Per document (`_navigate_document`, document.py:97-156): **2A** collector navigation loop; **2B** batch hydration of all collected paths (document.py:131-139); **2C** reconcile deferred asset matches into the tree (document.py:141-148).
  - Collector loop (`_navigate_collector`, document.py:158-~420): `while nav_state.step_count < self._config.max_nav_steps` (document.py:186; default max_nav_steps=6, see below); each iteration = one LLM call through `navigate_step` (agentic/navigation/tools.py:36-337) that returns exactly ONE main action ∈ {EXPAND, BACK, SEARCH_IMAGES, SEARCH_TABLES, FINISH} plus optional COLLECT side effects (prompts.py:48-61; response schema prompts.py:89-93). Legal actions are built from the visible section tree + budget state (navigation/tools.py:93-104); action IDs are prefixed E*/B*/S*/F* and validated against the legal set (navigation/tools.py:201-213, 266-292; prompts.py:99-100).
  - SEARCH actions trigger `search_assets_step` (agentic/navigation/assets.py:319) — an LLM/VLM asset inspector that judges candidate images/tables against the original query (wired in document.py:`_execute_asset_tools`, including VLM fn creation with overdraft allowance, assets invoked at document.py:703-726); empty-result searches block repeat searches in the same scope (document.py:812-829).
  - **Agent budget config** defaults (agentic/core/runtime.py:19-28), env-overridable:
    - `max_nav_steps = 6` ← RETRIEVAL_AGENTIC_MAX_NAV_STEPS
    - `latency_budget_ms = 30000` ← RETRIEVAL_AGENTIC_LATENCY_BUDGET_MS
    - `token_budget_total = 40000` ← RETRIEVAL_AGENTIC_TOKEN_BUDGET_TOTAL
    - `planning_ratio = 0.5` ← RETRIEVAL_AGENTIC_PLANNING_RATIO
    - `bootstrap_budget = 2000` ← RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET
    - `per_doc_min_share = 1500` ← RETRIEVAL_AGENTIC_PER_DOC_MIN_SHARE
  - Every LLM call goes through a budgeted wrapper (reserve estimate → call → commit actual usage) — agentic/core/runtime.py:58-148; token extraction prefers total_tokens (runtime.py:151-162).
- **Phase 3 — evidence rendering** (agentic/evidence/builder.py): `trim_evidence_to_budget` (builder.py:226-301, see §3.5) then `render_evidence` → per-doc tree rendering with asset URLs (builder.py:133-160).
- **Decision trace**: structured steps with phases kg_select / navigate / asset_inspect / terminal are recorded throughout (agentic/orchestrator.py:282-316, 375-401; navigation/document.py:1082-1098) and merged into the API response by the route (execution/routes.py:252-292).
- **Scores in the agentic response** (execution/routes.py:172-219): layer 1 = discovery RRF score carried on each referenced chunk; layer 2 = per-document KG confidence from the kg_select decision trace, backfilled for navigation-only chunks lacking a discovery score.

### 4.4 LLM adapters and models

packages/shared-python/shared/services/retrieval/llm_adapter.py:
- Navigation LLM: **temperature 0.1, max_tokens 2048** (llm_adapter.py:27-28, 109-116); thinking mode via env RETRIEVAL_LLM_THINKING forces temperature 0 and max_tokens ≥ 8192 (llm_adapter.py:131-137).
- Planner LLM: thinking=True default, **temperature 0.0, max_tokens 8192** (llm_adapter.py:175-204); planner model resolution honors RETRIEVAL_PLANNER_MODEL then per-provider defaults e.g. deepseek-reasoner / qwq-32b-preview / glm-4-plus / o3-mini for thinking (llm_adapter.py:66-83).
- VLM: **max_tokens 4096**, model from IMAGE_MODEL or "qwen3.6-flash" (llm_adapter.py:86-92, 207-244).
- Default text models per provider key: deepseek-v4-flash / qwen-plus / glm-4-flash / gpt-4o-mini (llm_adapter.py:48-63). Returns None (→ lexical/discovery-only fallbacks) when no credentials are configured (llm_adapter.py:126-128, 182-184).

---

## 5. Caching

All in packages/shared-python/shared/services/retrieval/cache_service.py, backed by **Redis** (`RedisServiceFactory.get_service()`, cache_service.py:9, used at 95-161, 225-251).

### 5.1 Query-result cache

- Key format (cache_service.py:72-91): `retrieval:query:{user_id}:{namespace}:v{version}:{sha256_digest}`
- Digest inputs (`_cache_shape_digest`, cache_service.py:34-69): query, top_k, sorted exclude_document_ids, normalized+sorted exclude_sections ("docId:sectionPath"), chunk_types (sorted, comma-joined), signal_paths (sorted), filter_mode, channels (sorted), channel_weights (sorted items), rerank, threshold, internal_recall_k, use_agentic, decomposition_enabled — joined with "|" and SHA-256 hashed (cache_service.py:51-69).
- TTL: **300 seconds** (`_RETRIEVAL_CACHE_TTL_SECONDS = 300`, cache_service.py:11; applied at cache_service.py:189).
- Versioning: per-user/namespace counter key `retrieval:version:{user_id}:{namespace}` (cache_service.py:16-18); read via get (cache_service.py:94-103), bumped on invalidation (`bump_retrieval_namespace_cache_version`, cache_service.py:106-112; `invalidate_retrieval_cache_namespaces`, cache_service.py:115-131). Bumping the version orphans all old keys (they still expire by TTL).
- Read/write points in the pipeline: execution/plan.py:130-141 (read; hit returns cached response and **still schedules hit-stat updates** for the cached results, plan.py:196-202) and plan.py:147-158 (write after a successful run).
- ⚠️ **Latent defect — query cache is effectively dead code**: `RetrievalQuery.build_cache_extra` always includes keys `llm_text_model` and `llm_vision_model` (execution/query_request.py:78-99, specifically lines 97-98), but `_cache_shape_digest`'s signature accepts only the fixed parameter list above with **no **kwargs** (cache_service.py:34-50). Since `get/set_cached_retrieval_query_result` forward **extra_params straight into the digest function (cache_service.py:134-161, 164-190 via _query_cache_key at cache_service.py:72-91), every call raises TypeError — which is swallowed by the try/except in execution/plan.py:204-205 ("Failed to read retrieval cache (ignored)") and plan.py:233-234. Net effect: no query result is ever cached or served from cache on the current code path.

### 5.2 Workflow plan cache (works)

- Key: `retrieval:workflow:plan:{user_id}:{namespace}:v{version}:{digest}` (cache_service.py:193-213); digest over query/top_k/chunk_types/exclude_document_ids only (cache_service.py:206-212).
- TTL: **600 seconds** (`_WORKFLOW_PLAN_CACHE_TTL_SECONDS = 600`, cache_service.py:12; applied at cache_service.py:251).
- Used by the planner service: read before planning (workflow/plan_service.py:34-46), write after (workflow/plan_service.py:60-71).

### 5.3 Related: hit stats are NOT cached

Retrieval hit statistics (the input to importance scoring, §3.3) live in Postgres (`retrieval_hit_stats`) and are updated asynchronously after every query including cache hits (stats/recorder.py:25-67; plan.py:160-164, 196-202).

---

## Appendix A: End-to-end flow summary

1. `run_retrieval_query` (app_service.py:17-55) → `RetrievalExecutionPlan.execute` (execution/plan.py:72-172): LLM override context, empty-query filter (plan.py:109-119), cache check (§5.1), route dispatch.
2. Route selection (execution/routes.py:23-33): small-corpus / agentic / classic.
3. Classic: `bottom_discovery` (3× channel @ 2·top_k → weighted RRF k=60, weights 1.0/2.0/1.5 → section merge → discovery_score normalization) → `rank_retrieval_candidates` (importance multiplier 0.1–2.0, sort by (agent, discovery, order)) → `assemble_retrieval_results` (hydration/result_assembly.py:18-90: page-chunk snippet extraction via query tokens result_assembly.py:56, 100-118; table summary composition; connected media embedding) → hit-stat update.
4. Agentic: planner DAG (≤5 steps, ≤3 parallel, wallet 200k / 40k per step) → each step a full RetrievalAgent (discovery+RRF → LLM doc selection from KG with discovery hints → per-doc observe-act navigation ≤6 steps × (EXPAND/COLLECT/BACK/SEARCH_IMAGES/SEARCH_TABLES/FINISH) under 30 s latency + 40k token budgets → evidence trimmed to 90% of remaining context budget by (confidence, discovery_score, importance)) → reference dedupe → two-layer score backfill (§4.3).

## Appendix B: Complete list of numeric constants and config keys

| Constant / env key | Value | Location |
|---|---|---|
| CHANNEL_WEIGHT_PATH | 1.0 | settings.py:3 |
| CHANNEL_WEIGHT_CONTENT | 2.0 | settings.py:4 |
| CHANNEL_WEIGHT_TERM | 1.5 | settings.py:5 |
| INTERNAL_RECALL_K_MULTIPLIER | 2 | settings.py:6 |
| RRF_K | 60 | settings.py:7 |
| DEFAULT_TOP_K | 10 | settings.py:8 |
| BM25 (rank_bm25 BM25Okapi) k1 / b | 1.5 / 0.75 (library defaults, unoverridden) | lexical_ranker.py:43; pyproject.toml:66 |
| term channel full-match score | 100.0 | channels.py:317 |
| discovery_score normalization default | 0.5 | discovery/tools.py:145 |
| top_doc_ids size | 5 | discovery/tools.py:157 |
| importance half-life (days) | 30.0 | stats/service.py:11 |
| importance alpha (usage) / beta (freshness) | 0.7 / 0.3 | stats/service.py:12-13 |
| importance decay constant | exp(-0.693·days/30) | stats/service.py:20 |
| importance multiplier low / high | 0.1 / 2.0 | ranking.py:62-63 |
| KG MIN_KEYWORD_OVERLAP | 3 | graph/keywords.py:7 |
| KG KEYWORD_SCORE_WEIGHT | 1.0 | graph/keywords.py:8 |
| KG MIN_SCORE_THRESHOLD | 0.8 | graph/keywords.py:9 |
| KG MIN_ENTITY_OVERLAP | 2 | graph/keywords.py:12 |
| TF-IDF top_k keywords per doc | 10 | graph/keywords.py:102 |
| token min length (retrieval tokenizer) | 2 | text_utils.py:250, 288 |
| discovery hint max paths/doc in prompt | 5 | discovery/tools.py:299 |
| LLM nav temperature / max_tokens | 0.1 / 2048 | llm_adapter.py:27-28 |
| LLM planner temperature / max_tokens | 0.0 / 8192 | llm_adapter.py:179, 198 |
| VLM max_tokens | 4096 | llm_adapter.py:211 |
| RETRIEVAL_AGENTIC_MAX_NAV_STEPS | 6 | core/runtime.py:21 |
| RETRIEVAL_AGENTIC_LATENCY_BUDGET_MS | 30000 | core/runtime.py:22 |
| RETRIEVAL_AGENTIC_TOKEN_BUDGET_TOTAL | 40000 | core/runtime.py:23 |
| RETRIEVAL_AGENTIC_PLANNING_RATIO | 0.5 | core/runtime.py:24 (wallet.py:37) |
| RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET | 2000 | core/runtime.py:25 (wallet.py:40) |
| RETRIEVAL_AGENTIC_PER_DOC_MIN_SHARE | 1500 | core/runtime.py:26 (wallet.py:43) |
| RETRIEVAL_PLANNER_THINKING_BUDGET (planner_budget) | 4000 | workflow/runtime_config.py:19 |
| RETRIEVAL_WALLET_TOTAL_BUDGET | 200000 | workflow/runtime_config.py:20 |
| RETRIEVAL_WALLET_PER_RETRIEVE_STEP_BUDGET | 40000 | workflow/runtime_config.py:21 |
| RETRIEVAL_DECOMPOSITION_MAX_STEPS (max_steps) | 5 | workflow/runtime_config.py:22 |
| RETRIEVAL_WORKFLOW_PARALLEL_MAX (parallel_max) | 3 | workflow/runtime_config.py:23 |
| wallet _RETRIEVE_FLOOR | 4000 | workflow/wallet.py:12 |
| evidence trim safety_margin | 0.9 | evidence/builder.py:235 |
| COLLECT default confidence / EXPAND drill confidence | 0.7 / 0.8 | prompts.py:168, 172; navigation/tools.py:235, 274 |
| KG-selected doc confidence | 1.0 (hardcoded) | discovery/tools.py:267 |
| retrieval query cache TTL | 300 s | cache_service.py:11 |
| workflow plan cache TTL | 600 s | cache_service.py:12 |
| prompt token estimate heuristic (chars/2 + 800) | — | navigation/tools.py:118-122 |
