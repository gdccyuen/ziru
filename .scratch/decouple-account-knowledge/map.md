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
- [06 — Admin Console Rework Scope](issues/06-admin-console-rework-scope.md) — Dashboard = stateless admin console (own DB disappears): Users (grades/profiles/disable/reset/SSO pre-link), API keys (all, revoke any), Attribute dictionary (new), Job & document monitoring (default view), Webhooks (kept — fog resolved), health panel; read-only env-backed settings panel; marketing/newsletter/billing/credits/usage-costs/guest/self-signup/auth-callbacks deleted. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [05 — WebUI Rework Scope](issues/05-webui-rework-scope.md) — WebUI: login via core (password + SSO buttons), all local identity deleted; Account settings page (own password + own API keys; dashboard admin-only); sources panel = profile-scoped filtered document view with attribute chips, active filter bag = chat retrieval scope; workspaces/members/namespace machinery removed; upload gated by grade (admin any values; librarian own-profile values + extra dictionary attributes for specificity); chat/chunks/citations/toggles/templates/traces unchanged; chat threads per user with create/switch/delete, stored in webui DB (chat-only DB). Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [02 — Account Domain Design](issues/02-account-domain-design.md) — Grades + permissions matrix; librarian manages (shrink profile, grade librarian↔user, disable, reset password) only users they created; bootstrap admin (env-overridable default password, must-change enforced by API); password policy via configurable module; disable-not-delete lifecycle; API keys sk_/hashed/no expiry/instant revoke/masked, any grade manages own; SSO = no auto-provision, no email match, admin pre-link only (IdP identity recorded at account creation), password login remains; sessions = core-issued HttpOnly cookie forwarded by both UIs. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [07 — Billing & Credits Removal Inventory](issues/07-billing-removal-inventory.md) — full removal inventory (research/billing-removal-inventory.md): billing/credit/tier/guest code, tables, config keys, error codes, admin UI, webui dead types; system_limits + per-route RPM stay; concurrent-job cap = env `MAX_CONCURRENT_JOBS` (default 4, global, 0/-1 unlimited) enforced in job admission; 7-step deletion order keeping suites green. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [04 — Knowledge API Surface](issues/04-knowledge-api-surface.md) — v2 surface accepted: profile scope enforced server-side (shrink-only); documents (upload file/URL with attributes, list, view, PATCH attributes, admin-only delete, chunks/structure); `POST /v2/search` JSON with required non-empty `query` + mandatory `filters` (browsing via `GET /v2/documents`); attribute dictionary readable by all, managed by admin; jobs list admin-only, own job visible to uploader; webhooks excluded (fog). Prototype: prototype/knowledge-api-surface.md. Attributes: admin-managed dictionary (keys + optional allowed values); multi-value allowed; every object carries mandatory built-ins `createBy` + `createTime` (auto-set, immutable, searchable); profile = key→allowed-values constraints, fail-closed all-match; docs with no dictionary attributes are admin-only until tagged; librarians may strip all dictionary attributes but never the mandatory pair.
- [03 — External Identity Provider (AD/SSO) Research](issues/03-external-identity-provider-research.md) — SSO = OIDC authorization-code + PKCE with the core API as relying party (Authlib/openid-client); LDAP bind as fallback for plain AD DS; avoid SAML. Core owns the handshake and `external_identity_links`; **PM override in 02: no auto-provision — admin pre-link only**; local grades/profiles authoritative; WebUI keeps thin redirect/proxy routes. Full findings on branch `research/external-identity-provider` (commit `f12e5be`).

## Not yet specified

<!-- nothing remains open above "just build it" — see Map status below -->


- Execution sequencing: final order of cuts across core/admin/webui with test-suite gates and demo-document re-upload — deletion order supplied by 07; the concrete build sequence is set when implementation starts.


## Map status

**Route complete — 2026-08-18.** All seven tickets (01–07) are resolved; every decision above "just build it" is made. Handoff to implementation: build plan at `docs/OVERHAUL.md`.

- Build sequence = ticket 07's deletion order: schema/migrations → shared library → core API → worker → admin → webui → contracts/env hygiene.
- Gate every step on the existing test suites (core pytest, admin ~108, webui ~619; DB-gated tests skip without TEST_DATABASE_URL).
- Finish by re-uploading the demo documents and re-running the feel-test; keep the MinerU attribution credit in the product UI.
- Carried items outside this map: GHCR publishing, real domain, CI, GitHub housekeeping, dark logo, webui Docker image.
- Telemetry: **removed completely** within this overhaul (build-plan decision D4).

## Out of scope

- Publishing/packaging: GHCR image, real domain (`ziru.app`), CI, GitHub housekeeping — separate efforts, not this overhaul.
- Cosmetic branding tasks (e.g. dark logo variant).
- New parsers, new retrieval algorithms, or changes to the engine — frozen by Q5.
- Deployment-level service split (account service vs knowledge service) — code-level split only (Q2).
