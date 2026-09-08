# Ziru.1 — Session Handoff

Prepared for a fresh agent continuing the work. Next-session focus (per the
handoff arguments): **continue with the study results in the docs folder**.

## Initial thinking

Build a modularised KB system (version 2) from current version of 'Ziru', signified by:

- use a modern and compact layout of UI, enable bootstrap5 change of skin;
- instead of current distinct webui and admin portal, unify the UI with top tabs to switch between Query (for all), User admin (for admin), Attributes (for admin), Jobs (for admin and lib), Document Intake (for lib);
- pack the intake module and retrieval module into definite and limited interfaces that enable easy test and optimisation;

It has the following modules:

- access control
    - document
        - system attribute
            - docId - uuid
            - createTime
            - createBy
        - manual attribute 
            - topic
            - branch
            - division
            - section
    - user 
        - authentication means:
            - local user name and password with adjustable policy
                - password length
                - character combination
                - ...
            - SSO
        - roles: 
            - admin,
            - librarian,
            - user;
        - system attribute:
            - userId - uuid
            - pwHash - array
        - manual attribute:
            - branch
            - division
            - section
- document intake module:
    - feed documents to external service MinerU, get back markdown,
    - break markdown into chunks of text, table, image, page
    - form a tree for document by sections
    - add summaries on document and large sections 
    - add keywords and mutations for broader semantic scope
    - assign weights to summaries, keywords or mutations according to the the closeness 
- retrieval module:
    - break query into keywords, or  of keywords
    - use BM25 to retrieve by:
        - document or section path/title;
        - document or section summary;
        - text chunk;
    - use LLM to present the answer; 
- optimisation module:
    - collect feedbacks 
    - scheduled batch job (or run by demand):
        - tune the weights
        - align the keywords from intake side and retrieval side

## Workspace

- Session workspace: `/Users/gordon/Documents/repos/ziru.1`
- All Ziru.1 artifacts live under `docs/` there.

## Project in one paragraph

Ziru is a modular, self-hosted knowledge-base system (security-document corpus).
Four modules: access control, document intake (MinerU → markdown → chunks →
section tree → summaries/keywords/weights), retrieval (keyword BM25 + LLM
answer), and optimisation (feedback + scheduled weight/keyword tuning). An
earlier `ziru` repo already exists as a Knowhere fork; `ziru.1` re-derives
the clarified decisions.

## Decisions already locked

- **Stack**: Python 3.11+/FastAPI + Celery/Redis; **PostgreSQL as source of
  truth**; **OpenSearch single node** for BM25 (with Knowhere's
  Postgres+`rank_bm25` kept as a fallback behind the channel seam); MinIO for
  files; local Unsloth Studio or any OpenAI-compatible LLM URL; **pgvector
  reserved** for future semantic fusion; one docker-compose on-prem stack.
- **Chunk tree** (from Knowhere research): path string is the single source of
  truth (`file.ext/Section/Subsection`); exactly 4 chunk types
  `text|image|table|page`; heading-boundary chunking; image/table are sibling
  chunks under `images/`/`tables/` roots (excluded from the section tree)
  back-linked to parent text via `connect_to/embeds` char offsets; sections =
  adjacency list + materialised path.
- **Retrieval**: 3 channels (path=1.0 / content=2.0 / term=1.5) → weighted RRF
  (k=60, 2×top_k recall); one shared tokenizer on intake and query; search
  fields precomposed from content + summaries + entities + section rollups.
- **Optimisation**: implicit hit-stats + explicit feedback → scheduled batch:
  tune channel weights as per-request overrides, decayed usage boost clamped to
  [0.1, 2.0], keyword re-alignment by recomposing search fields + reindex.
- **ACL**: admin/librarian/user roles + fail-closed attribute profiles; enforced
  in a single scope predicate (Postgres WHERE + OpenSearch filter).

## Key artifacts (read these first; do not duplicate them)

- `docs/technical-design.md` — consolidated Ziru.1 design (stack, chunk tree,
  PostgreSQL data model, OpenSearch index mapping, intake/retrieval/
  optimisation, ACL, open items). **Primary spec for the build.**
- `docs/research/knowhere-solutions.md` — cited upstream study (all 8
  questions, file:line references from `/Users/gordon/Documents/repos/knowhere`).
- `docs/research/_report_retrieval.md` — deep-dive on the retrieval internals.
- `docs/samples/SecDocs/eval/queries.yaml` — **55 test queries with expected
  returns** (documents + sections + chunk evidence + must-not) across all 23 PDFs.
- `docs/samples/SecDocs/eval/README.md` — eval schema + grading rules.
- `docs/samples/SecDocs/parsed/` — MinerU output for all 23 PDFs
  (`<name>.json` with `md_content`+`content_list`; `<name>.md` plain markdown).
- `docs/samples/SecDocs/parse_driver.py` — resumable MinerU async driver
  (submits /tasks, polls, saves JSON+MD). Re-runnable.

## What happened this session (summary)

1. Functional requirements captured (4 modules) + 5 technical decisions
   confirmed by the user.
2. Research agent studied the local Knowhere clone → `docs/research/`.
3. Discovered local MinerU (`http://127.0.0.1:8000`, v3.4.5; `POST /file_parse`,
   `POST /tasks`). Parsed all 23 SecDocs PDFs to `parsed/`.
4. Built the 55-query eval set grounded in the parsed markdown.
5. Wrote `docs/technical-design.md` consolidating stack + Knowhere findings.

## Environment facts

- Local MinerU service: `http://127.0.0.1:8000` (healthy at last check).
- Upstream clone: `/Users/gordon/Documents/repos/knowhere`.
- Prior Ziru fork (frozen engine reference): `/Users/gordon/Documents/repos/ziru`
  (FastAPI core on :5005, Next.js admin/webui, deploy compose stack).
- No secrets/API keys/passwords were captured in this session.

## Open next steps (both offered to the user, awaiting choice)

1. **Build plan** — phase the design doc: account/ACL → intake → OpenSearch
   retrieval → optimisation + eval harness.
2. **Wire & measure first** — point the existing `ziru` fork at the SecDocs
   corpus, ingest, and run the 55 queries for a real baseline before writing new
   code.

## Suggested skills

Invoke these in the next session as relevant:

- `domain-modeling` — turn `docs/technical-design.md` into the repo's domain
  glossary / ADRs before coding.
- `codebase-design` — design the channel seam, scope predicate, and optimisation
  interfaces as deep modules.
- `research` — any further primary-source lookups (e.g. OpenSearch BM25 field
  mapping specifics) captured as Markdown in `docs/research/`.
- `prototype` — sanity-check the chunk-tree/OpenSearch state model or the eval
  grader before committing to it.
- `tdd` — build intake/retrieval/optimisation features test-first against the
  eval set.
- `code-review` — when reviewing changes against the design doc and eval spec.
