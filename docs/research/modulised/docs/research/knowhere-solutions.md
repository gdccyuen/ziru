# Knowhere Solutions — Research for Ziru

Source: local clone of https://github.com/ontos-AI/knowhere at /Users/gordon/Documents/repos/knowhere.
All paths below are relative to that repo root unless stated otherwise. Line numbers refer to the checked-out revision (May 2026 open-source release).

Companion notes in this directory: `3channels.md`, `classic&agentic.md`, `minueru&formats.md`, `mutation.md` are earlier Q&A transcripts on the same codebase (retrieval flows, MinerU usage, query mutation); their key claims were re-verified against source while writing this document.

---

## 1. Document / chunk model

### 1.1 Three-level object model: Job → JobResult (revision) → Document

A **Job** is the intake/processing handle; a **Job Result** is the terminal artifact of one processing run; a **Document** is the retrieval-visible knowledge object. Revisions are handled by pointer, not copies: `documents.current_job_result_id` selects the active revision, and every section/chunk row carries both `document_id` and `job_result_id` so old revisions can coexist (CONTEXT.md, "Document"/"Job Result" terms; packages/shared-python/shared/models/database/document.py:39-44).

### 1.2 Tables (PostgreSQL ORM)

All in packages/shared-python/shared/models/database/document.py:

- **documents** (document.py:26-58): `document_id`, `user_id`, `namespace` (default `"default"`), `status` (active/archived), `current_job_result_id`, `source_file_name`, `document_metadata` JSON, `parse_track` (default `"chunk"`; a `page` track exists for page-memory/atlas documents).
- **document_sections** (document.py:62-135): the explicit section tree. An **adjacency list** (`parent_section_id` self-FK, document.py:103-107) **plus a materialized path** (`section_path`, `" / "`-joined, document.py:109). Also `section_title`, `section_level` int, `summary` Text, `section_metadata` JSON, `sort_order`. Unique on (document_id, job_result_id, section_path) (document.py:128-131).
- **document_chunks** (document.py:139-230): `chunk_id` (deterministic content hash from the parser, see 1.4), `section_id` FK to its section, `chunk_type` (default "text"), `content`, four precomputed search-text columns (`content_lexical_text`, `path_lexical_text`, `content_search_text`, `path_search_text`, `term_search_text`) plus two **computed PostgreSQL TSVECTOR columns** with GIN indexes (document.py:176-193, 219-228). Also `source_chunk_path` (the parser's hierarchical path), `file_path` (asset path for image/table chunks), `chunk_metadata` JSON, `sort_order`. Unique on (document_id, job_result_id, source_chunk_path) (document.py:210-213).
- **graph_nodes / graph_edges** (document.py:234-320): derived knowledge-graph state. Nodes have `node_kind`, owner document, optional `ref_document_id`/`ref_section_id`, `properties` JSON; edges have `edge_kind`, directed flag, **`weight` Float**, `properties` JSON.
- **retrieval_hit_stats** (document.py:324-360): per-document and per-chunk `hit_count`/`last_hit_at` — the feedback signal for ranking boosts (see 4.3).
- **retrieval_runs / retrieval_steps** (document.py:364-415): append-only analytics of every agentic query and each agent step (query, plan, action_type, observation, latency, tokens) — the tuning/observability substrate.

### 1.3 Is there an explicit document TREE?

Yes, two materializations of the same hierarchy:

1. **DB tree**: `document_sections` adjacency list + materialized path (above). Built at publication time by walking each chunk's parser path and creating missing ancestors (packages/shared-python/shared/services/retrieval/publication_content.py:53-105, `DocumentSectionPublisher.ensure_section`).
2. **doc_nav.json**: a JSON navigation tree shipped in the result package and used for agent browsing — `{version, file_name, stats, sections:[{title, path, level, summary, chunk_count, children[]}], resources:{images[], tables[]}}` (packages/shared-python/shared/services/storage/zip_doc_navigation.py:37-126; schema documented in AGENTS.md "doc_nav.json"). Image/table assets are **not** section nodes — they live in the flat `resources` lists, while page chunks join the section tree with page-count semantics (zip_doc_navigation.py:88-100).

### 1.4 Node/chunk types and nesting

Chunk types are exactly four: `Literal["text", "image", "table", "page"]` (packages/shared-python/shared/services/chunks/dataframe_chunk_converter.py:41; retrieval allowlist in packages/shared-python/shared/services/retrieval/settings.py:10-11).

- **text**: one chunk per section body (see 2.3); nested under its `section_id`.
- **image / table**: sibling chunks with their own paths under media roots `images/...` and `tables/...`; these roots are explicitly excluded from the section tree (packages/shared-python/shared/services/chunks/document_path.py:34, 46-50). They link back to the parent text chunk via `metadata.connect_to`: `{target: <chunk_id>, relation: "embeds"|"related", ref: "[images/image-N.png]", position:{start,end}}` — character offsets of the inline reference inside the text content (dataframe_chunk_converter.py:371-386; AGENTS.md "Chunk Field Reference").
- **page**: atlas/page-track documents (ultra-long PDFs, drawing atlases); carry `page_nums` and a page-PDF reference for evidence rendering (apps/worker/tests/contract/test_agentic_evidence_renderer_contract.py:100-118; models/schemas/page_memory_config.py).

**Chunk identity**: `chunk_id` is a deterministic hash of the chunk's pure text (parser-side `gen_str_codes`, e.g. apps/worker/app/services/document_parser/formats/markdown/parser.py:194-196), so identical content across documents collides; the converter falls back to a random UUID5 when no `know_id` is present (dataframe_chunk_converter.py:301-305). Note: AGENTS.md's pipeline diagram shows a `_dedup_chunks_by_content` step, but in current code publication assigns `deduped_chunks = chunks` unchanged (publication_service.py:109) — the "skip if all duplicates" branch exists but no dedup implementation feeds it. Treat cross-doc dedup as a documented-but-unwired design point.

### 1.5 On-disk corpus layout (result package / ZIP)

Per document: `chunks.json` (ordered chunk array), `doc_nav.json`, `manifest.json` (parse metadata + full heading hierarchy), `images/`, `tables/`, plus debug CSVs; corpus-level `knowledge_graph.json` (file metadata: top_keywords, top_summary, importance; cross-doc edges) and `chunk_stats.json` (hit analytics keyed by chunk_id) (AGENTS.md "Persisted Document Corpus Schema").

---

## 2. Intake pipeline

### 2.1 Flow

API: `POST /v1/documents` → Job created, file uploaded to S3-compatible storage at key `uploads/{job_id}{ext}` (packages/shared-python/shared/services/storage/job_file_storage.py:39-40) → Celery task enqueued with user-aware queue policy (CONTEXT.md "Document Ingestion Worker Dispatch").

Worker: `checkerboard_parse_output()` is the single stable parser entrypoint (apps/worker/app/services/document_parser/parse_service.py; AGENTS.md Stage ②). It (1) profiles the document (PDF: PyMuPDF feature probe + VLM coarse classification into `atlas/scanned/slides/generic`; oversized non-atlas PDFs get a structural-anatomy shard plan), (2) routes by extension, (3) post-processes assets (unreferenced-image cleanup, PNG→JPG compression), and returns a typed ParseOutput containing a pandas DataFrame with the fixed row schema `ALL_DF_COLS=content,path,type,length,keywords,summary,know_id,tokens,connectto,addtime,page_nums,entities,asset_title` (apps/api/.env.example "Parser row schema").

Format routing table (AGENTS.md "Parser Routing Table"): PDF → MinerU SaaS API → Markdown parser; DOCX → OXML iteration + heading prediction; `.doc/.xls` → LibreOffice headless conversion first; PPTX → iLoveAPI PPTX→PDF → MinerU; XLSX → sheet-by-sheet HTML tables; MD/TXT → markdown parser; images → VLM description+OCR.

### 2.2 Section-tree construction (heading hierarchy)

Core module: `pred_titles()` (apps/worker/app/services/document_parser/structure/layout_parser.py:455-699). Pipeline:

1. **Candidate filtering** per format (structure/heading_candidates.py): markdown heading lines, DOCX outline-level blocks, numbered-heading regexes (`1.2.3`, `第X章`, `（一）`).
2. **TOC-first**: if a TOC exists it is ground truth — pre-TOC front matter is excluded from prediction and spliced back as non-headings (layout_parser.py:498-540, 683-695); multiple TOCs split the document into zones processed in parallel with zone-specific TOC context (layout_parser.py:542-635).
3. **Naive pass** `est_hierarchies_naive` (regex) then optional **LLM pass** `hiearchy_llm()` (layout_parser.py:162-298) with the `eval-headings` prompt (packages/shared-python/shared/services/ai/prompt_service.py:211+): compact skeleton input (body lines folded to `[N BODY LINES]` placeholders), TOC as confirmed structure, "preceding context" of open ancestors for sharded documents, hard rules (parent-child continuity, no level skipping, normalize to start at level 1). Model: `HIERARCHY_LLM_MODEL` falling back to `NORMOL_MODEL` (layout_parser.py:45-47).
4. **PDF font clustering**: K-means on span heights from MinerU `layout.json` groups headings into 5 discrete tiers (AGENTS.md "Heading Detection").
5. **Tree repair**: stack-based tree build (structure/heading_tree.py:9-41), removal of isolated single-child chains (heading_tree.py:86-161), DOCX post-processing merges (layout_parser.py:652-656).

DOCX specifics: `iter_block_items()` yields OXML elements labeled PTXT/TABLE/IMAGE/TOC-AREA; a `headings_stack` of `{heading, content[], level}` dicts is maintained — a new heading pops the stack while top level ≥ its own level, then pushes (apps/worker/app/services/document_parser/formats/docx/parser.py:571-580). Tables convert via `table2html()` with rowspan/colspan read directly from OXML (docx/parser.py:408; AGENTS.md "DOCX Parsing Deep Dive").

### 2.3 Chunking strategy: heading boundaries, not fixed sizes

There is **no character-window chunker**. A chunk is the run of body content between two headings at a given path:

- `MarkdownParseState.path_stack` (apps/worker/app/services/document_parser/formats/markdown/parse_state.py:89-120) tracks the heading stack; levels are re-based so the first seen heading is level 1 (`adjusted_level = level - base_level + 1`, parse_state.py:95). Semantic slashes in titles are escaped to U+2215 `∕` so `/` stays the sole hierarchy separator (packages/shared-python/shared/services/chunks/path_segments.py:1-31); duplicate paths get a `_N` suffix counter (parse_state.py:109-113).
- On each new heading, accumulated content is flushed as one row whose `path` is the current stack path (formats/markdown/parser.py:368-378; parse_state.py:64-75); consecutive headings with no body produce a placeholder chunk so the previous path still exists (parser.py:373-376).
- **Images and tables inside a section** become separate rows (type image/table, paths `images/image-N <context>.png` / `tables/table-N <context>.html`) **and** an inline reference block `[images/image-N ...]` is appended to the section's text content — this dual representation is what later becomes the `connect_to/embeds` link (parser.py:381-482).
- XLSX: each sheet → HTML table rows (AGENTS.md routing table). Atlas PDFs produce **page** chunks instead of section chunks.

### 2.4 Table / image extraction

- Tables: DOCX OXML → HTML with exact spans; MD tables cleaned and converted to HTML (parser.py:424-449); images embedded inside tables are extracted and referenced (parser.py:451-464).
- Images: perceptual-hash dedup by raw RGBA pixel buffer so re-compressed copies collide (apps/worker/app/services/document_parser/formats/image/parser.py:40-55); size gates `IMG_MIN_SIZE`/`IMG_MAX_SIZE` (image/parser.py:77-101); VLM description + OCR via the shared summary engine (image/parser.py:32, 117+).

---

## 3. Semantic metadata (summaries, keywords, entities, scores)

### 3.1 Per-chunk LLM enrichment (intake side)

- **Text chunks**: summarized only when `len(content) > 1500` and the `summary_txt` parser option is on; tasks are collected during parse and executed in a deferred parallel batch (formats/markdown/parser.py:202-211, 491-501; parse_state.py:134-149). Prompt `summary-full` (packages/shared-python/shared/services/ai/prompt_service.py:134-174) returns JSON `{title, summary, entities}`; summary length is capped by the prompt's max_tokens; language must match input.
- **Assets (image/table)**: prompt `summary-asset-linesplit` (prompt_service.py:176-208) returns exactly 3 lines — caption/title, summary (with key numbers for statistical data), and a semicolon-separated named-entity list that becomes the chunk's `keywords`. Table headers are detected by a dedicated `detect-table-headers` prompt (prompt_service.py:934).
- **Entities**: typed as `{text, type}` with vocabulary `ENTITY_TYPES=person,location,organization` (apps/api/.env.example; prompt entity instruction at prompt_service.py:107-115); empty extraction is explicitly valid.

### 3.2 Section and document summaries (bottom-up)

After parsing, `_enrich_document_navigation()` (apps/worker/app/services/document_ingestion/success_finalization.py:135-182) materializes `doc_nav.json` and runs bottom-up recursive summarization (apps/worker/app/services/connect_builder/summary_builder.py):

- **Default is deterministic**: a non-leaf's summary = `"This section covers: " + child titles (+ self-only content)`, top level uses `"This document includes: "`, truncated to 100 tokens head/tail (summary_builder.py:26-35, 219-240).
- **LLM is opt-in per section** (`use_llm=False` default) and only fires when the sum of child contributions + self-only text exceeds `SUMMARY_MAX_LEN = 100` chars (summary_builder.py:282-353).
- **Document top summary uses LLM by default** (`top_summary_use_llm=True`, max_tokens=200) (success_finalization.py:161-172; summary_builder.py:379-424).
- The resulting `{section_path → summary}` map is passed into publication and stored on `document_sections.summary` (publication_content.py:88) — and, crucially, **injected into every chunk's search fields** at publish time (see 4.2).

### 3.3 Weights / scores

No weights are assigned to summaries or keywords at intake. Scores exist in three places:

1. **Knowledge-graph edge weights**: document nodes store TF-IDF top-10 keywords (`score = freq * (log(N/df) + 1)`, packages/shared-python/shared/services/retrieval/graph/keywords.py:100-126); cross-document edges are created only when shared typed entities ≥ 2 **or** shared keywords ≥ 3, with a length-weighted overlap score ≥ 0.8 (graph/keywords.py:7-12; graph/service.py:219-270); `weight = round(score, 4)` on the edge row.
2. **Document importance** in `knowledge_graph.json` (base score feeding ranking; AGENTS.md corpus schema).
3. **Retrieval hit stats → importance multiplier**: `importance = 0.7 * hit_count * e^(-0.693*days_since_last_hit/30) + 0.3 * e^(-0.693*days_since_created/30)` (packages/shared-python/shared/services/retrieval/stats/service.py:11-28), mapped through an IQR-z sigmoid to a **0.1–2.0 multiplier** on candidate scores (packages/shared-python/shared/services/retrieval/search/ranking.py:58-91).

### 3.4 "Mutations" / variants

Knowhere stores **no text variants/rewrites of chunks**. The only "mutation" machinery is query-side, and it is deliberately narrow:

- The workflow planner may decompose a compound user query into ≤5 sub-queries (packages/shared-python/shared/services/retrieval/workflow/planner.py:33-62); decomposition is refused for most queries ("Most queries are single-step").
- **Asset search (SEARCH_IMAGES/SEARCH_TABLES) intentionally ignores model-generated rewrites and always uses the original user query** — "so navigation cannot silently broaden or narrow the asset inspector's task" (packages/shared-python/shared/services/retrieval/agentic/prompts.py:182-189; see also `mutation.md` in this directory).

---

## 4. Retrieval

### 4.1 Engines: BM25 + substring, no vectors

Retrieval is **lexical-only**. There are three channels over one scoped-corpus SQL CTE (user_id + namespace + active status + current revision; packages/shared-python/shared/services/retrieval/search/channels.py:21-68):

| Channel | Indexed column | Scoring |
|---|---|---|
| path | `path_search_text` (pre-tokenized) | BM25Okapi (channels.py:143-173) |
| content | `content_search_text` (pre-tokenized) | BM25Okapi (channels.py:176-202) |
| term | `term_search_text` (raw text) | substring grep: full-query hit = **100.0**, else matched-token count (channels.py:253-326) |

BM25 is the third-party `rank-bm25` package (`BM25Okapi`, library defaults k1=1.5, b=0.75 — packages/shared-python/shared/services/retrieval/search/lexical_ranker.py:14-50; dependency "rank-bm25>=0.2.2" in packages/shared-python/pyproject.toml:66), run **in Python over the rows fetched by SQL**. The computed TSVECTOR/GIN columns are selected but not used for scoring (channels.py:36-38). The path-channel docstring states the seam explicitly: "A future vector score can be fused on top of the returned BM25 score" (channels.py:156-160).

### 4.2 Field composition at publication (the intake↔retrieval alignment point)

Built in packages/shared-python/shared/services/retrieval/search/lexical_text.py, called from publication_content.py:138-168:

- **content field** = chunk content + node-level summary + flattened entity surface forms + section rollup summary, tokenized with `stopwords=[]` (lexical_text.py:113-140). The docstring names the intent: closing the "VLM summary 未入 content_search_text" gap — LLM metadata becomes lexical mass.
- **path field** = source file name + section path + section title + section summary (lexical_text.py:166-183).
- **term field** = raw `content + " " + path`, untokenized, for the grep channel (lexical_text.py:186-200).
- **Table chunks are indexed by summary + keywords + caption instead of raw HTML** in all three builders (lexical_text.py:203-230) — the VLM/LLM description is what makes tables retrievable.

### 4.3 Fusion and boosting

- Weighted RRF: `score = Σ weight/(k + rank + 1)`, **k=60**, weights **path=1.0, content=2.0, term=1.5** (packages/shared-python/shared/services/retrieval/settings.py:3-7; search/scoring.py:42-68). Weights are overridable per request via `channel_weights` (agentic/discovery/tools.py:114-119). Each channel recalls **2×top_k** rows (`INTERNAL_RECALL_K_MULTIPLIER=2`, settings.py:6) before fusion; rows sharing a section are merged and scores min-max-normalized to `discovery_score` (scoring.py:13-39, 71-94).
- **Usage boost**: hit stats upserted after every query (stats/service.py:31-57) feed the importance multiplier of 0.1–2.0 (ranking.py:58-91); final sort key is `(agent_score, discovery_score, insertion order)` (ranking.py:159-166).
- **KG document linking** (TF-IDF top-10 keywords, overlap thresholds 3 keywords / 2 entities, score ≥ 0.8 — graph/keywords.py:7-12) powers the LLM's cross-document selection in agentic mode.

### 4.4 Query expansion

The user query is **not LLM-keyword-expanded**; it goes through the same tokenizer as ingestion (see 4.5). LLM "expansion" exists only as (a) planner sub-query decomposition for compound questions (workflow/planner.py:33-62) and (b) query-intent classification into MACRO_SUMMARY/STRUCTURE_OVERVIEW/FACTUAL_DETAIL/NUMERIC_DETAIL/ASSET_LOOKUP/UNKNOWN which biases navigation behavior, not search terms (agentic/prompts.py:105-129). BM25 results are also fed back as per-document "discovery hints" (section-path lists, max 5/doc) into the LLM document-selection prompt as soft signals (agentic/discovery/tools.py:218-222, 295-329; agentic/prompts.py:17-19).

### 4.5 Shared tokenizer (the keyword-alignment mechanism)

One pipeline serves both sides — packages/shared-python/shared/utils/text_utils.py:245-301:

- CJK spans: **OpenCC traditional→simplified normalization** then **jieba** segmentation — "so that 繁/简 variants produce the same tokens on both ingest and query sides, letting BM25 cross-match" (text_utils.py:29-36).
- English spans: blingfire `text_to_words` (fallback syntok) (text_utils.py:213-218).
- Filters: min token length 2, meaningful-char check, shared default stopword list split into zh/en sets (text_utils.py:146-176, 231-242); chunk-reference markers stripped before tokenizing (text_utils.py:180-183).
- Ingestion stores the result in `metadata.tokens` (via `tokenize2stw_remove`, text_utils.py:303-340); publication re-tokenizes composed fields with `tokenize_contents_for_retrieval`; query tokenization is `tokenize_query_for_ranker = tokenize_for_retrieval(query, dedupe=True)` (search/lexical_ranker.py:10-11).

### 4.6 Agentic retrieval (planner + DAG + navigation)

Route selection (packages/shared-python/shared/services/retrieval/execution/routes.py:23-33): small-corpus shortcut (≤top_k chunks → return all), agentic route when `use_agentic=True`, else classic top-k.

Agentic = WorkflowOrchestrator (workflow/orchestrator.py:38-204): LLM planner produces a DAG of ≤5 retrieve-steps (`RETRIEVAL_DECOMPOSITION_MAX_STEPS=5`, parallel ≤3, token wallet 200k total / 40k per step with 4k floor — workflow/runtime_config.py:8-24; workflow/wallet.py:12, 50-89), executed in topological batches. Each step runs a full RetrievalAgent (agentic/orchestrator.py):

1. **Discovery**: the same 3-channel BM25+RRF as classic mode — channel search is always the foundation (agentic/discovery/tools.py:40-180).
2. **Document selection**: LLM picks document IDs from a KG overview enriched with discovery hints (discovery/phase.py:17-95; agentic/prompts.py:11-30).
3. **Per-document navigation**: observe-act loop, ≤6 steps (`RETRIEVAL_AGENTIC_MAX_NAV_STEPS=6`), 30 s latency budget, 40k token budget (agentic/core/runtime.py:19-28); each step = one LLM call choosing EXPAND / COLLECT / BACK / SEARCH_IMAGES / SEARCH_TABLES / FINISH over the visible section tree (agentic/navigation/tools.py:36-337; prompts.py:48-93).
4. **Evidence**: collected sections trimmed to 90% of remaining context budget by `(confidence, discovery_score, importance)` (agentic/evidence/builder.py:226-301); KNOWHERE returns evidence only, never final answers (agentic/orchestrator.py:1-15).

### 4.7 Caching

Redis-backed (packages/shared-python/shared/services/retrieval/cache_service.py): query-result cache key `retrieval:query:{user}:{ns}:v{version}:{sha256(shape digest)}` TTL 300 s with per-namespace version-counter invalidation (cache_service.py:11, 72-91, 106-131); workflow-plan cache TTL 600 s (cache_service.py:12, 193-251). Caution: the query-result cache is currently dead code — `build_cache_extra` passes model-name keys that `_cache_shape_digest` doesn't accept, so every get/set raises a swallowed TypeError (execution/query_request.py:97-98; cache_service.py:34-50). Only the plan cache actually works.

---

## 5. Storage / databases

| Store | Role | Evidence |
|---|---|---|
| **PostgreSQL 15** (asyncpg) | All relational state: documents/sections/chunks/graph/hit-stats/runs, jobs, users, API keys, billing, webhooks. Migrations (alembic) run at API startup. | apps/api/.env.example `DATABASE_URL=postgresql+asyncpg://...`; deploy/local-dev/docker-compose.dev.yml:20-39; README "Quick Start" step 5 ("The API runs migrations during startup") |
| **Redis 7** | Celery broker (`CELERY_REDIS_URL`), rate limits, API-key auth cache (TTL 3600 s), retrieval caches, distributed locks/state-machine progress | apps/api/.env.example; CONTEXT.md "Redis State"; apps/api/app/services/auth/api_key_authentication_service.py:16, 74-83 |
| **S3-compatible object storage** (LocalStack in dev) | Uploads `uploads/{job_id}{ext}`; results `results/{job_id}/...` including the ZIP result package (chunks.json, doc_nav.json, manifest, images/, tables/) and MinerU raw artifacts | apps/api/.env.example (S3_BUCKET_NAME=knowhere-uploads, S3_RESULTS_BUCKET=knowhere-results); packages/shared-python/shared/services/storage/job_file_storage.py:39-49; success_finalization.py:77-82 |
| **No vector DB** | No pgvector/Milvus/Qdrant/Elasticsearch/OpenSearch anywhere. BM25 runs in Python over SQL-fetched rows; TSVECTOR columns exist but are unused for scoring. | grep across packages/shared-python (only channels.py:36-38 selects the tsv columns); lexical_ranker.py:14-50 |

Single-node/docker-friendly: yes — the entire infra stack is three containers (Postgres, Redis, LocalStack) plus two app processes/containers (see 7). External SaaS dependencies are optional at runtime: MinerU (PDF), iLoveAPI (PPTX), LLM/VLM providers, Stripe/QStash for billing/webhooks (apps/api/.env.example "Required for specific features").

---

## 6. Access control / auth

- **Users**: the `user` table is *reference-only* — "User data is actually managed by the Dashboard" (packages/shared-python/shared/models/database/user.py:1-28).
- **API keys**: per-user, stored as hash + display mask, with `enabled_modules` JSON list (coarse module gating), `expires_at`, `is_active` (models/database/api_key.py:18-55). Validation resolves key→user via a Redis cache `api-key:user-id:{hash}` TTL 3600 s with reverse index for revocation (apps/api/app/services/auth/api_key_authentication_service.py:16, 74-83).
- **Auth flow**: Bearer header → API key **or** dashboard JWT → identity `(user_id, permission, source)`; the only permission levels are `FULL_ACCESS` and `READ_ONLY` (dashboard JWTs can be read-only; writes rejected by `require_write_permission`) (apps/api/app/api/dependencies/auth.py:17-48).
- **Isolation model**: there are **no roles, no teams, no per-document ACLs**. Every content table carries `user_id + namespace` and every retrieval query is scoped by both in the corpus CTE (channels.py:53-55); "Namespace is part of the retrieval contract, not a UI-only label" (CONTEXT.md Invariants). Guest tier = API key with a restricted route surface (CONTEXT.md "Guest API Key").

---

## 7. Deployment

- **Images**: multi-stage Dockerfiles for API and worker — `python:3.12-slim-trixie`, uv-managed venv, non-root user, healthcheck on `:5005/health` (deploy/docker/Dockerfile.api:1-99; Dockerfile.worker). Published to ghcr.io/ontos-ai/knowhere (README badges).
- **Local dev stack**: deploy/local-dev/docker-compose.dev.yml = `redis:7-alpine` + `postgres:15-alpine` + `localstack/localstack:3.8` (services s3,sns,sqs,lambda,iam,sts); started by `./deploy/local-dev/start-dev.sh`; API and worker then run on the host via `uv run main.py` / `uv run worker.py` (README "Quick Start" steps 4-5).
- **Single-node self-host**: the full compose stack packaging API + worker + dashboard lives in a separate repo, knowhere-self-hosted (README Ecosystem table). Ports: API 5005, Postgres 5432, Redis 6379, LocalStack 4566 (README "Local Endpoints").
- Telemetry to PostHog is default-on, opt-out via `TELEMETRY_ENABLED=false` (README "Telemetry"; docs/adr/0004-anonymous-self-hosted-telemetry.md).

---

## 8. Reusable patterns for Ziru

### 8.1 Document tree containing text/table/image/page chunks

1. **Path-as-hierarchy is the single source of truth.** One string `file.ext/Section/Subsection` with U+2215 escaping for semantic slashes (path_segments.py:1-31). The DB section tree, doc_nav.json, and search path-field are all *projections* of chunk paths — no separate tree builder to keep in sync (publication_content.py:36-40; zip_doc_navigation.py:128-177).
2. **Adjacency list + materialized path** for the section table (parent_section_id + section_path), with level and sort_order; unique per revision+path (document.py:103-135).
3. **Heading-boundary chunking**: one text chunk per section body; no fixed-size windows; placeholder chunks keep empty sections navigable (parse_state.py:64-87; parser.py:373-376).
4. **Assets as sibling chunks + back-links**: image/table rows live under `images/`, `tables/` roots excluded from the section tree, linked to their parent text chunk by `connect_to/embeds` with character offsets (document_path.py:34, 46-50; dataframe_chunk_converter.py:371-386). This gives both flat asset retrieval and in-context citation.
5. **Fourth type "page"** for page-granular documents (atlas/long PDFs) that still joins the section tree with page-count semantics (zip_doc_navigation.py:88-100).
6. **Deterministic content-hash chunk IDs** (gen_str_codes/know_id) for stable identity and future cross-doc dedup (parser.py:194-196; dataframe_chunk_converter.py:301-305).

### 8.2 Tuning weights / aligning keywords between intake and retrieval

1. **One tokenizer on both sides** (jieba + OpenCC t2s for CJK, blingfire/syntok for EN, shared stopword list, min length 2) — traditional/simplified cross-matching is an explicit design goal (text_utils.py:29-36, 245-301).
2. **Compose search fields at publication from content + LLM metadata**: content field = content + chunk summary + entities + section rollup; path field = file + path + title + section summary; tables indexed by summary+keywords+caption, not raw HTML (lexical_text.py:113-230). This is the concrete "keyword alignment" mechanism: whatever the LLM produced at intake becomes BM25 mass at retrieval with no separate index.
3. **Named weight constants + per-request overrides**: channel weights 1.0/2.0/1.5, RRF k=60, recall multiplier 2 (settings.py:3-8; discovery/tools.py:114-119) — a small, explicit tuning surface.
4. **Usage feedback loop with bounded influence**: hit stats → exponential-decay importance (30-day half-life, 0.7/0.3 usage/freshness mix) → sigmoid multiplier clamped to [0.1, 2.0] so analytics can never reorder by more than 20× (stats/service.py:11-28; ranking.py:58-91).
5. **Deliberate non-expansion for asset search**: pin SEARCH_IMAGES/SEARCH_TABLES to the original user query so LLM rewrites cannot silently change what gets inspected (agentic/prompts.py:182-189).
6. **Observability as a first-class table**: every agentic run and step is logged (query, plan, actions, observations, latency, tokens) in retrieval_runs/retrieval_steps (document.py:364-415) — the data needed to tune weights later.

---

## Recommendations for Ziru

Mapping knowhere's solutions onto Ziru's four modules:

### Access control
- Copy the **user_id + namespace scoping on every content table** with hashed API keys and a two-level permission (full/read-only). It is simple, audit-friendly, and already proven at scale here (auth.py:17-48; api_key.py:18-55; channels.py:53-55). Keep "namespace is part of the retrieval contract" as an invariant.
- Knowhere has **no per-document ACLs or roles** — if Ziru needs sharing/permissions beyond user isolation, that is net-new design; model it as a document-level grant table checked in the same corpus-scope CTE knowhere uses (one place to enforce).

### Document intake
- Adopt **heading-boundary chunking with path-as-hierarchy** (8.1.1-3): it keeps every chunk fully contextualized by its section path and makes the tree a free projection instead of a separate structure to maintain.
- Keep **text/table/image as sibling chunk types with `embeds` back-links** (8.1.4) — it is the pattern that lets agents cite "section 3.2, figure 1" while still retrieving the asset flat. Add a **page type** if Ziru will handle long/scan-heavy PDFs (8.1.5).
- Gate LLM enrichment: summarize only chunks >~1500 chars and all assets; keep section summaries **deterministic by default** ("This section covers: …") with LLM aggregation opt-in above a length threshold, and LLM on for the document-level summary (summary_builder.py:26-35, 282-353; parser.py:202-211). This is cheap and predictable.
- Use deterministic content-hash chunk IDs from day one even if dedup is not wired yet (publication_service.py:109 shows the cost of a design point left unwired).

### Retrieval
- Baseline on **3-channel lexical search with weighted RRF** (content-weighted 2.0, path 1.0, term/grep 1.5, k=60, 2×top_k recall) — it is simple, deterministic, cache-friendly, and needs no vector infra (settings.py:3-8; channels.py). Keep the **precomposed search fields including summaries/entities/section rollups** so LLM metadata directly improves recall (lexical_text.py:113-230).
- **Share one tokenizer between intake and query** with script normalization (OpenCC-style) — this is knowhere's actual answer to keyword mismatch, cheaper than query expansion (text_utils.py:245-301).
- Design the fusion seam so a vector score can be added later without rework — knowhere documents exactly this intent in the path channel (channels.py:156-160).
- If agentic navigation is wanted, copy the **discovery-first architecture**: BM25+RRF always runs first; LLM only selects documents and walks section trees on top of it, with hard step/latency/token budgets (agentic/orchestrator.py:1-15; core/runtime.py:19-28).

### Optimisation
- Expose the **named weight constants as a per-request override surface** (channel_weights pattern, discovery/tools.py:114-119) so tuning does not require deploys.
- Implement the **bounded usage-feedback boost**: decayed hit-count importance → sigmoid multiplier clamped to [0.1, 2.0] (stats/service.py:11-28; ranking.py:58-91). The clamp is the important part — it keeps analytics from destabilizing relevance.
- Log every query/step to append-only run tables (retrieval_runs/retrieval_steps) from v1; that data is what makes later weight tuning evidence-based (document.py:364-415).
- Cache by a **normalized shape digest + namespace version counter** for invalidation (cache_service.py:72-131) — but fix knowhere's dead-cache bug (extra params forwarded into a fixed-signature digest function, execution/query_request.py:97-98 vs cache_service.py:34-50) rather than copying it.
