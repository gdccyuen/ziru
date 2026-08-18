# Wayfinder Map — Decouple Account & Knowledge Domains

## Destination

Ziru becomes a self-hosted, on-premise knowledge engine:

- **Knowledge domain**: standalone knowledge objects carrying key–value attributes (e.g. `user=<uploader>`, `createTime=…`, `division=finance`) used for both search and access control. No namespaces. No owner concept.
- **Account domain**: a thin identity layer — administrator / librarian / user grades, each with an access profile; one identity store in the core API; external SSO (e.g. Active Directory) supported; API keys per account that carry the account's live profile; billing, credits, tiers, and guest mode eliminated (one simple concurrent-job cap remains).
- **Engine untouched**: parse → hierarchy → chunks → graph, 3-channel BM25 + RRF, agentic retrieval, and chat generation keep their algorithms and mechanisms; calls to external MinerU and OpenAI-compatible models, default `deepseek-v4-flash`.
- **UI**: dashboard = users + API keys + server settings + job/document monitoring; WebUI authenticates through the core API and searches with its own profile as the default (shrink-only).
- **Clean start**: new schema, no data migration; the demo documents are re-uploaded to prove the engine still works.

The map is done when the route is clear — every decision above "just build it" is resolved in a closed ticket.

## Notes

- **Domain**: self-hosted enterprise knowledge management. The PM is not a programmer: plain English, a recommendation with every option, demos over descriptions, ask before big actions.
- **Skills to consult**: `grilling`, `domain-modeling`, `prototype`, `research` for the map; `code-review` once implementation lands. Update `core/CONTEXT.md` and `webui/CONTEXT.md` as the new vocabulary crystallises during implementation.
- **Standing constraints**: engine algorithms/mechanisms frozen (Q5) — the existing test suites (core suite, webui 619, admin 108) are the guardrails for every cut; clean start (Q12); MinerU attribution credit (license obligation) must survive in the product UI.
- **Tracker**: local markdown under `.scratch/` (see wayfinder's local-tracker conventions). Can migrate to GitHub Issues later if desired.
- **Facts already confirmed in code**: `deepseek-v4-flash` is already the default text model; the worker already integrates external MinerU; billing/credits/tiers/guest exist across core, admin, and webui.

## Settled in charting (session 2026-08-18, Q1–Q12)

- Q1 — Product: self-hosted on-prem knowledge engine; external MinerU + OpenAI-compatible APIs; default model DeepSeek V4 Flash.
- Q2 — Decoupling: knowledge objects carry KV attributes (user, createTime, division, …) used for search and access control; code split into an account package and a knowledge package; no namespace concept; no owner concept.
- Q3 — Auth: initialisation creates an admin with a default password, forced change at first login; grades administrator / librarian / user; any account can create API keys that carry the account's access profile.
- Q4 — Billing: delete all billing/credit/tier logic; keep a simple concurrent-job cap.
- Q5 — Engine: keep the core BM25 + agentic knowledge search, process, and generate algorithms and mechanisms unchanged; prove with the test suites.
- Q6 — Access control: fail-closed — a non-admin sees a document only if it satisfies the whole of their profile.
- Q7 — Search: global search, default scope = the user's own profile; users may shrink the scope further; no namespace replacement.
- Q8 — Lifecycle: uploader sets attributes at upload (librarian only values from own profile, admin any); admin edits any attributes; librarian edits only within own profile; deletion admin-only.
- Q9 — Identity: single identity store in the core API; dashboard = admin console; WebUI authenticates via the API; flexibility for external SSO (e.g. AD) required.
- Q10 — API keys: live profile — keys always grant the account's current profile.
- Q11 — Dashboard: users, API keys, server settings, and job/document monitoring; all billing pages deleted.
- Q12 — Data: clean start, no migration.

## Decisions so far

- [01 — Knowledge Object Attribute Model](issues/01-knowledge-object-attribute-model.md) — Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [07 — Billing & Credits Removal Inventory](issues/07-billing-removal-inventory.md) — full removal inventory (research/billing-removal-inventory.md): billing/credit/tier/guest code, tables, config keys, error codes, admin UI, webui dead types; system_limits + per-route RPM stay; concurrent-job cap = env `MAX_CONCURRENT_JOBS` (default 4, global, 0/-1 unlimited) enforced in job admission; 7-step deletion order keeping suites green. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [04 — Knowledge API Surface](issues/04-knowledge-api-surface.md) — v2 surface accepted: profile scope enforced server-side (shrink-only); documents (upload file/URL with attributes, list, view, PATCH attributes, admin-only delete, chunks/structure); `POST /v2/search` JSON with required non-empty `query` + mandatory `filters` (browsing via `GET /v2/documents`); attribute dictionary readable by all, managed by admin; jobs list admin-only, own job visible to uploader; webhooks excluded (fog). Prototype: prototype/knowledge-api-surface.md. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [03 — External Identity Provider (AD/SSO) Research](issues/03-external-identity-provider-research.md) — SSO = OIDC authorization-code + PKCE with the core API as relying party (Authlib/openid-client); LDAP bind as fallback for plain AD DS; avoid SAML. Core owns the handshake and `external_identity_links`; auto-provision configurable, default grade `user`; local grades/profiles authoritative; WebUI keeps thin redirect/proxy routes. Full findings on branch `research/external-identity-provider` (commit `f12e5be`).

## Not yet specified

- New database schema shape — attribute storage shaped by 01; knowledge API surface decided by 04; remaining: account tables and schema wait on 02.
- Sequencing and verification plan: the order of cuts across core/admin/webui and which test suites gate each step; demo-document re-upload — deletion order now supplied by 07; execution sequencing graduates as implementation starts.
- Fate of webhooks (keep in the account domain or drop) — revisit with 02 and 06.
- Chat generation surface (prompt templates, defaults) — confirm with 04 and 05.

## Out of scope

- Publishing/packaging: GHCR image, real domain (`ziru.app`), CI, GitHub housekeeping — separate efforts, not this overhaul.
- Cosmetic branding tasks (e.g. dark logo variant).
- New parsers, new retrieval algorithms, or changes to the engine — frozen by Q5.
- Deployment-level service split (account service vs knowledge service) — code-level split only (Q2).
