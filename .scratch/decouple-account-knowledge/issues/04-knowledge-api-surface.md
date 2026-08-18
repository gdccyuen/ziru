# 04 — Knowledge API Surface

Type: prototype
Status: resolved
Resolved: 2026-08-18 (prototype v1 reviewed by PM, Q18–Q21)
Blocked by: —

## Question

What does the public API surface look like once namespaces and user ownership are gone?

- Upload with attributes: who may upload, which attributes are required vs optional.
- Retrieval/search: default scope = the caller's profile; optional narrower filters; what replaces the `namespace` parameter.
- Document metadata read and edit (attribute editing rules, Q8); delete (admin-only).
- Jobs and monitoring endpoints.
- Path/versioning changes — this is a clean start (Q12), so breaking changes are acceptable.

Deliverable: a rough endpoint-by-endpoint spec (a prototype) for the PM to react to.

## Answer

Prototype v1 (prototype/knowledge-api-surface.md) reviewed and accepted with Q18–Q21:

- **Surface shape:** clean start reusing the `/v2` prefix; old `/v1` knowledge endpoints (namespaces, user-scoped lists, billing, guest, demo) retired in the same release. Two identity methods: `/auth/*` sessions (sketch, detail in ticket 02) and API keys carrying the account's live profile.
- **One access rule:** the server intersects every query with the caller's profile scope (fail-closed); filters can only shrink.
- **Documents:** POST /v2/documents (file OR URL — Q21; librarian/admin; 403 for user grade; createBy/createTime auto-stamped), GET list, GET {id}, PATCH {id}/attributes (Q8 rules), DELETE {id} admin-only, GET {id}/chunks, GET {id}/structure (engine read paths).
- **Search (Q18):** POST /v2/search — structured JSON; `query` OPTIONAL (empty = pure attribute browsing); `filters` MANDATORY bag of attribute criteria (never an unscoped call); engine parameters keep today's contract (topK, internalRecallK, rerank, agentic).
- **Attribute dictionary (Q20):** GET /v2/attributes for any authenticated user; POST/PATCH/DELETE admin-only.
- **Jobs (Q19):** POST /v2/jobs (librarian/admin); GET /v2/jobs/{id} uploader or admin; GET /v2/jobs admin-only (monitoring).
- **Webhooks/qstash deliberately NOT in the surface** — still open fog.
- **Client impact recorded:** WebUI SDK rewrite + filtered views (ticket 05); admin external-api + monitoring (ticket 06); contract fixtures for removed endpoints deleted with them (ticket 07 inventory).
