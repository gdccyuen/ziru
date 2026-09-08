# Ziru Technical Design (ziru.1)

Status: draft for review — consolidates the functional spec, the five confirmed
stack decisions, and the Knowhere research.

Sources:
- Functional spec (access control / document intake / retrieval / optimisation).
- Confirmed decisions: OpenSearch single node; on-prem Docker; solo operator
  (PM mindset, security/user-focused); local Unsloth Studio or OpenAI-compatible
  API; reserve embeddings now.
- Knowhere research: `docs/research/knowhere-solutions.md` (primary source:
  local clone `/Users/gordon/Documents/repos/knowhere`).
- Note: an existing `ziru` repo is already a Knowhere fork with the engine
  "frozen". This document re-derives the decisions for the clarified `ziru.1`
  build and calls out where we intentionally diverge.

---

## 1. Confirmed stack

| Concern | Choice | Why |
|---|---|---|
| Service language | Python 3.11+ (FastAPI) | Best ecosystem for document parsing, LLM orchestration, and the existing Knowhere engine |
| Async jobs | Celery + Redis | Long-running MinerU intake must not block the API |
| System of record | PostgreSQL 15+ (SQL) | Users/roles/ACL, document tree, attributes, weights, feedback are relational |
| BM25 index | OpenSearch single node | True per-field BM25, rebuildable, k-NN available later |
| Files | S3-compatible (MinIO in Docker) | Markdown, images, pages, result packages are objects |
| Cache/queue | Redis 7 | Broker + auth/query caches + rate limits |
| LLM | Local Unsloth Studio or any OpenAI-compatible URL | `PROVIDER_URL`-style single seam |
| Embeddings (reserved) | pgvector in PostgreSQL | Agreed now; not used by v1 lexical retrieval |
| Packaging | One docker-compose stack, on-prem | Ease of test/deploy; single node |

PostgreSQL stays the **single source of truth**. OpenSearch is a derived,
rebuildable index — if it is down, retrieval can fall back to the in-Python BM25
baseline that Knowhere already ships (see §2).

---

## 2. Retrieval engine: OpenSearch vs the Knowhere baseline

The research shows Knowhere does **not** use OpenSearch/Elasticsearch: it runs
3-channel BM25 with the `rank-bm25` Python package over rows fetched from
PostgreSQL, and its TSVECTOR columns exist but are unused
(`research/knowhere-solutions.md` §4.1, §5).

Decision for ziru.1:

- **Keep the chosen OpenSearch single node as the BM25 index.** It gives real
  per-field BM25 scoring, clean reindexing, and an upgrade path to hybrid k-NN.
- **Keep the channel abstraction** so each channel (path / content / term) is one
  implementation seam. The Knowhere in-Python `rank_bm25` path remains a
  fallback implementation behind the same seam, useful for degraded mode and for
  matching the frozen engine's behaviour in tests.
- **Publication order:** write canonical rows to PostgreSQL, then index into
  OpenSearch from those rows (idempotent, rebuildable). No dual-write source of
  truth.

---

## 3. Document & chunk tree (the core question)

Adopt Knowhere's model; it already matches the spec's text/table/image/page
requirement.

### 3.1 Path string is the single source of truth

One slash-joined path per chunk: `file.ext/Section/Subsection`. Semantic
slashes inside titles are escaped to U+2215 `∕` so `/` remains the hierarchy
separator. Everything else is a projection of this path:

- the PostgreSQL `document_sections` table,
- `doc_nav.json` for agent browsing,
- the BM25 `path_search_text` field.

No separate tree builder to keep in sync; sections are materialized lazily from
chunk paths at publication.
(Source: `research/knowhere-solutions.md` §1.2, §1.3, §8.1.1.)

### 3.2 Exactly four chunk types

`text | image | table | page`
(Source: `dataframe_chunk_converter.py:41`.)

| Type | Organisation | Notes |
|---|---|---|
| `text` | one chunk per section body, nested under `section_id` | heading-boundary chunking, **not** fixed-size windows |
| `image` | sibling chunk under `images/` root | root excluded from section tree |
| `table` | sibling chunk under `tables/` root | indexed by summary+keywords+caption, not raw HTML |
| `page` | joins the section tree with page-count semantics | for atlas / ultra-long / scan-heavy PDFs |

### 3.3 Dual representation for assets

Images and tables get two forms:

1. a **flat sibling chunk** (retrievable on its own), and
2. an inline reference block in the parent text chunk's content, linked back via
   `metadata.connect_to = {target, relation: "embeds", position: {start, end}}`
   (character offsets of the inline reference).

This is what lets an agent both retrieve "figure 1" flat and cite it in section
context.
(Source: `research/knowhere-solutions.md` §1.4, §2.3, §8.1.4.)

### 3.4 Section table shape

`document_sections`: `section_id`, `document_id`, `job_result_id`
(revision), `parent_section_id` (adjacency list), `section_path`
(materialized `" / "`-joined), `section_title`, `section_level`,
`summary`, `section_metadata` JSON, `sort_order`. Unique on
(document, revision, section_path).

### 3.5 Chunk identity

Deterministic content-hash `chunk_id` (parser `know_id` / `gen_str_codes`),
so identical content has stable identity and future cross-document dedup is
possible. Note: Knowhere's dedup step is documented but currently unwired — we
wire it or explicitly defer it, we do not leave it silent.

---

## 4. PostgreSQL data model (draft)

- **Account:** `users` (userId UUID, pwHash array, disabled, must_change_password),
  `roles` (admin/librarian/user), `user_roles`, `sessions`, `api_keys`,
  `external_identity_links` (SSO/OIDC pre-link).
- **Attributes / ACL:** `attribute_dictionary` (admin-managed keys + allowed
  values: topic, branch, division, section, …), `document_attributes` (values
  per document), `user_profiles` (attribute constraints per user, fail-closed).
- **Knowledge:** `documents`, `document_sections`, `document_chunks`,
  `graph_nodes`, `graph_edges` (with `weight`).
- **Feedback & optimisation:** `retrieval_hit_stats` (per doc + per chunk),
  `feedback` (explicit thumbs/ratings + query + result ids),
  `retrieval_runs`, `retrieval_steps` (append-only observability),
  `tuning_runs` (scheduled batch job outcomes).
- **Documents system attributes:** `docId` UUID, `createTime`,
  `createBy` — stored as columns and mirrored into attributes for consistency.

Document/section/chunk columns mirror §3.4; `document_chunks` also carries the
precomposed search fields (§6.3) and, reserved, an `embedding` vector column
(pgvector) left null in v1.

---

## 5. OpenSearch index mapping (draft)

Index: `ziru-chunks-v1`, one document per chunk.

| Field | Type | Use |
|---|---|---|
| `chunk_id` | keyword | identity / dedup |
| `document_id` | keyword | filter, grouping |
| `section_path` | text + keyword | path channel, filters |
| `section_title` / `section_summary` | text | path channel |
| `chunk_type` | keyword | text/table/image/page filter |
| `content` | text | content channel |
| `content_search` | text (tokenized) | BM25, boosted 2.0 |
| `path_search` | text (tokenized) | BM25, boosted 1.0 |
| `term_search` | keyword (or wildcard) | substring/grep channel, boosted 1.5 |
| `attributes` | flattened keyword | ACL filter (`topic`, `branch`, `division`, `section`) |
| `embedding` | k-NN vector (reserved) | future semantic fuse |

Ranking: weighted RRF over the three channels, k=60, weights
path=1.0 / content=2.0 / term=1.5, each channel recalling 2×top_k before fusion.

---

## 6. Intake pipeline

1. **Ingest** file/URL → Job → S3 upload.
2. **Parse** with MinerU (local `localhost:8000` already validated in this
   workspace) → markdown + content_list.
3. **Build section tree** (heading-boundary chunking, §3.2).
4. **Enrich**:
   - document top summary — LLM (capped, same language);
   - section summaries — deterministic by default (`"This section covers: …"`),
     LLM opt-in above a length threshold;
   - per-chunk summary + typed entities (`person/location/organization`) +
     keywords for text/table/image.
5. **Compose search fields** (the intake↔retrieval alignment point, §6.3).
6. **Publish**: Postgres rows → OpenSearch index → result package.

### 6.3 Precomposed search fields (keyword alignment)

- `content_search` = chunk content + chunk summary + entity surface forms +
  section rollup summary.
- `path_search` = source file name + section path + section title + section
  summary.
- `term_search` = raw content + path (for substring channel).
- Tables use summary + keywords + caption instead of raw HTML.

This is the concrete "align keywords from intake and retrieval" mechanism: LLM
metadata produced at intake becomes lexical BM25 mass at retrieval, with no
separate variant store.

---

## 7. Retrieval pipeline

1. Normalize + tokenize the query with the **same tokenizer used at intake**
   (shared stopword list; script normalization if CJK support is added later).
2. Resolve scope = caller profile ∩ request filters (fail-closed).
3. Run the 3 channels against OpenSearch within that scope.
4. Fuse with weighted RRF.
5. Optional agentic navigation: BM25 discovery always runs first; the LLM only
   selects documents and walks section trees on top of it, under hard
   step/latency/token budgets.
6. Return **evidence + citations**; the LLM writes the final answer in chat mode.

---

## 8. Optimisation module

### 8.1 Feedback collection

- Implicit: `retrieval_hit_stats` upserted after every query (per document and
  per chunk).
- Explicit: `feedback` table (query id, result ids, rating, optional comment),
  surfaced in the web UI as thumbs/report.

### 8.2 Scheduled batch job (or on demand)

A Celery beat job that:

1. **Tune weights** — fit channel weights / importance parameters from
   `retrieval_runs` + `feedback`, then persist them as per-request overrides
   (no redeploy). Keep weights as named constants with a per-request override
   surface.
2. **Tune the usage boost** — recompute decayed hit-count importance with a
   30-day half-life (0.7 usage / 0.3 freshness), sigmoid-mapped and **clamped to
   [0.1, 2.0]** so analytics can never reorder results by more than 20×.
3. **Align keywords** — regenerate/recompose `*_search` fields and reindex
   OpenSearch when the summarization/keyword prompts or tokenizer change; emit a
   keyword-drift report (query terms that hit nothing, top unmatched terms).

### 8.3 Guardrails

Bounded multipliers, append-only run/step logs, and a dry-run report before any
weight change is applied to the live index.

---

## 9. Access control mapping

Knowhere has only `user_id + namespace` scoping and two permissions
(full/read-only) — **no roles, no per-document ACLs** (§6 of the research).
Ziru.1 adds the missing layer:

- **Roles:** admin (bypasses profile), librarian (upload + manage), user (search).
- **Profile:** a set of `{attribute_key: allowed_values}` constraints;
  fail-closed (empty profile sees nothing).
- **Enforcement in one place:** a shared scope predicate computes the allowed
  `document_id` set from the caller's profile; it is applied both as a
  PostgreSQL `WHERE` and as an OpenSearch `filter` on `attributes`. No
  per-route ACL logic.
- **Document grants** (future): a `document_grants` table checked inside the
  same scope predicate, for one-off sharing beyond attribute matches.

---

## 10. Open items (recommended defaults)

| Item | Recommended default |
|---|---|
| BM25 engine | OpenSearch single node (per your choice); Postgres+`rank_bm25` as fallback behind the channel seam |
| Embeddings | Reserve pgvector column + OpenSearch k-NN field; do not fuse until a semantic-failure case is measured |
| MinerU | Use the running local service (`localhost:8000`) in dev; vendored MinerU image for prod parity |
| Agentic retrieval | Keep it (engine is frozen/proven); budgets default: ≤5 plan steps, ≤6 nav steps, 30 s nav budget |
| Query cache | Implement with a normalized shape digest + revision counter; do not copy Knowhere's dead-cache bug |
| Cross-document dedup | Wire it from day one (deterministic chunk IDs make it cheap) |
