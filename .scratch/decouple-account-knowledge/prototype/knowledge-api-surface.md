# Prototype — Knowledge API Surface (post-overhaul)

Ticket: [04 — Knowledge API Surface](../issues/04-knowledge-api-surface.md)
Status: prototype v1 — for the PM to react to; NOT the final spec.

## Design principles (from settled decisions)

1. **No namespaces, no owner.** A knowledge object (document) exists standalone; `createBy` + `createTime` are the only mandatory attributes, auto-set and immutable (01).
2. **Profile scope is enforced by the server.** Non-admins only ever see documents that satisfy their whole profile (fail-closed). Every query's filters are *intersected* with the profile scope — you can only shrink, never widen (Q6/Q7).
3. **Attributes are the only grouping/filter mechanism** (Q7): dictionary keys + values, multi-value allowed (01).
4. **Engine contract unchanged** (Q5): parsing → chunks → graph, 3-channel BM25 + RRF, agentic retrieval, chat generation — same request/response evidence contract as today, only access and ownership semantics change.
5. **Clean start** (Q12): breaking changes are fine. The existing `/v2` prefix is reused for the new surface; old `/v1` knowledge endpoints (namespaces, user-scoped lists) are retired in the same release.
6. **Two identity methods** (Q3/Q9, sketch — detailed in ticket 02): human sessions via `/auth/*` (login / SSO / logout / me), machines via API keys (`Authorization: Bearer sk_…`). An API key grants exactly the account's live profile (Q10). Users have no upload permission (Q3).

## Endpoint map

### A. Account surface (sketch — owned by ticket 02)

| Method & path | Who | What it does |
|---|---|---|
| POST /auth/login | all | Password login (admin bootstrap / normal login) |
| GET /auth/sso/{provider}/start · /callback | all | External SSO (OIDC primary, LDAP fallback — ticket 03) |
| POST /auth/logout · GET /auth/me | all | Session end / who am I |
| POST /v2/api-keys · GET /v2/api-keys · DELETE /v2/api-keys/{id} | any account | Create / list / revoke API keys (each carries the account's live profile) |

### B. Attribute dictionary (admin-managed, ticket 01 Q13)

| Method & path | Who | What it does |
|---|---|---|
| GET /v2/attributes | any authenticated account | List dictionary keys and their allowed values (so uploaders and searchers can pick) — Q20 confirmed |
| POST /v2/attributes | admin | Add a key (optionally with allowed values) |
| PATCH /v2/attributes/{key} | admin | Edit a key or its allowed values |
| DELETE /v2/attributes/{key} | admin | Remove a key (existing values stay on documents but are no longer selectable) |

### C. Documents (knowledge objects)

| Method & path | Who | What it does |
|---|---|---|
| POST /v2/documents | librarian, admin | Upload a file (or a URL — Q21 confirmed) with attributes; creates a parse job; `createBy`/`createTime` are stamped automatically. User grade → 403. |
| GET /v2/documents | all (scoped) | List/browse documents by attribute filters (Q18-revised: this is the attribute-browsing path); non-admins see only profile-visible documents |
| GET /v2/documents/{id} | all (scoped) | Document metadata + attributes (404 if not visible) |
| PATCH /v2/documents/{id}/attributes | admin, librarian | Edit attributes per Q8 rules (admin any; librarian only values within own profile; `createBy`/`createTime` always rejected) |
| DELETE /v2/documents/{id} | admin only | Delete a document (and its chunks) |
| GET /v2/documents/{id}/chunks | all (scoped) | Parsed chunks (WebUI chunks panel — engine read path) |
| GET /v2/documents/{id}/structure | all (scoped) | Section navigation tree (engine read path) |

### D. Search / retrieval (the kept engine, new access semantics)

| Method & path | Who | What it does |
|---|---|---|
| POST /v2/search | all (scoped) | Full retrieval: BM25 + RRF, optional agentic workflow, evidence + citations — same engine behavior as today, but the server intersects results with the caller's profile scope; query filters can only narrow further |

**Search body shape (Q18, PM decision, revised):** structured JSON; `query` is REQUIRED and must be non-empty (empty query is rejected — the API points the caller to `GET /v2/documents` for attribute browsing); `filters` is MANDATORY and always carries the criteria bag over attributes (a non-empty list; an empty filter bag is not allowed — at minimum the server injects the caller's profile constraints). The retrieval engine itself is unchanged: keyword matching (BM25 + RRF, optional agentic) runs inside the attribute-bounded candidate set.

Example request body (shape only):

```json
{
  "query": "water yield response to afforestation",
  "filters": [
    { "key": "division", "values": ["finance"] },
    { "key": "createTime", "range": { "gte": "2026-01-01" } }
  ],
  "engine": { "topK": 8, "internalRecallK": 30, "rerank": true, "agentic": true }
}
```

Attribute browsing (no keyword query) is a document-list operation, not a search: `GET /v2/documents` with the same filter syntax — profile-scoped, newest first.

### E. Jobs & monitoring

| Method & path | Who | What it does |
|---|---|---|
| POST /v2/jobs | librarian, admin | Create a parse job directly (URL ingestion, re-parse) |
| GET /v2/jobs/{id} | uploader or admin | Job status + result (uploader tracks their own upload) — Q19 confirmed |
| GET /v2/jobs | admin only | Job list for monitoring (dashboard default view, Q11) — Q19 confirmed |

### F. System

| Method & path | Who | What it does |
|---|---|---|
| GET /health · GET /version | unauthenticated | Liveness / build info |

## Explicitly removed in this surface

- `/v1/billing`, credits, balances, subscriptions, price configs, tiers (Q4 — inventory in ticket 07).
- `/v1/guest` (guest device registration — Q3).
- `/v1/demo` (demo catalog — WebUI demo mode already removed).
- `/v1/documents/namespaces` and every `namespace` parameter (Q2).
- User-scoped list semantics: documents are no longer listed "by user" — they are listed by attribute filter ∩ profile scope.
- Webhooks / qstash: NOT in this prototype — their fate is still open fog (map "Not yet specified").

## Client impact (for planning)

- **WebUI**: SDK rewrite (no namespace calls, no user-scoped lists); workspace/localization concept replaced by filtered views (ticket 05); upload flow sends attributes.
- **Admin**: external-api client updated; monitoring pages use `GET /v2/jobs` (ticket 06).
- **Contracts/tests**: contract fixtures for removed endpoints are deleted with them (ticket 07 inventory feeds this).

## Open points for the PM (reaction round)

1. ~~Search endpoint~~ — **decided (Q18, revised):** structured JSON `POST /v2/search`; `query` REQUIRED non-empty; `filters` mandatory bag of attribute criteria; attribute browsing = `GET /v2/documents` (no browse mode inside search).
2. ~~Job visibility~~ — **decided (Q19):** list = admin-only; single job = uploader or admin.
3. ~~Attribute dictionary~~ — **decided (Q20):** readable by all authenticated users; admin manages keys/values.
4. ~~URL ingestion~~ — **decided (Q21):** kept as an upload option alongside file upload.
