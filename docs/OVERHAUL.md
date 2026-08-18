# Ziru Overhaul — Build Plan

Status: **draft for PM review** (2026-08-18). Decisions live in the wayfinder map at `.scratch/decouple-account-knowledge/map.md` (all 7 tickets resolved). This document sequences the build itself.

## What we're building

Ziru becomes a self-hosted on-premise knowledge engine: knowledge objects with attributes (no namespaces, no owners), an account domain (administrator/librarian/user grades + profiles, single identity store in the core API, SSO via OIDC with LDAP fallback, API keys with live profiles), **no billing/credits/tiers/guest**, and the engine (parse → chunks → graph, BM25 + RRF, agentic retrieval, chat generation) **untouched**.

References: map `.scratch/decouple-account-knowledge/map.md` · tickets 01–07 in `.scratch/decouple-account-knowledge/issues/` · API prototype `.scratch/decouple-account-knowledge/prototype/knowledge-api-surface.md` · removal inventory `.scratch/decouple-account-knowledge/research/billing-removal-inventory.md`.

## Guardrails (every phase ends green)

| Component | Tests | Type-check / lint | Notes |
|---|---|---|---|
| core (API + worker + shared) | `cd core/apps/api && uv run pytest` · `cd core/apps/worker && uv run pytest` | `make check` (ruff + pyright) | Contract tests need `TEST_DATABASE_URL` (skip without it) |
| admin | `cd admin && pnpm test` (≈108) | `pnpm type-check` · `pnpm lint` | DB-gated tests skip without `TEST_DATABASE_URL` |
| webui | `cd webui && pnpm test` (≈619) | `pnpm typecheck` · `pnpm lint` | Integration tests need `TEST_DATABASE_URL`; e2e via Playwright |

Rule: no phase merges until its suite is green and the previous phase's checks still pass. The engine test suites are the frozen-contract proof (Q5).

## Kickoff decisions — **all decided (2026-08-18)**

- **D1 — Branch strategy:** the whole overhaul happens on branch `overhaul`; the live demo stack keeps running on `main` until cutover (P7), then `overhaul` merges to main.
- **D2 — SSO test target:** a local Keycloak (or mock OIDC server) joins the dev compose stack so OIDC flow is testable on-prem; no internet needed.
- **D3 — Feel-test glitch list:** logged at kickoff (PM input), fixed at P7 — the old WebUI is being reworked anyway.
- **D4 — Telemetry:** **removed completely** — not just default-off. Deletion lands with the shared-library cuts in P1 (core), the admin analytics surfaces in P5, and is verified by the P7 residue grep. ADR 0004 (anonymous self-hosted telemetry) is retired with it.

## Phases

### P0 — Baseline & guardrails (½ day)
- Run all suites; record baseline counts (core pytest, admin ≈108, webui ≈619) so later regressions are measurable.
- Create branch `overhaul`; verify DB-gated tests run against the dev Postgres (`TEST_DATABASE_URL`).
- Collect the feel-test glitch list (D3). No code changes.

**Exit:** baseline numbers recorded; branch exists; test-DB path works.

### P1 — New schema baseline & shared library (core)
- **Schema (clean start, Q12):** new Alembic baseline — account tables (users with grade/profile/must-change-password/disabled, sessions, api_keys, external_identity_links) and knowledge tables (documents without `user_id`/namespace, document_attributes, attribute_dictionary, jobs without billing columns; engine tables — sections, chunks, graph, retrieval stats — unchanged). Billing/guest/tier tables simply don't exist. Old migrations retired (07, step 1).
- **Shared library:** new models/schemas for users, grades, profiles, attributes; **profile-matching engine** (fail-closed all-match, multi-value); **password-policy module** (configurable: length, case, punctuation); delete billing/credit/tier/guest shared modules (07, step 2); **delete the telemetry module entirely** (shared/services/telemetry: config, events, runtime, aggregates) and retire ADR 0004 (D4); keep engine modules byte-identical.
- **Tests:** new unit tests (profile matching, attribute validation, password policy, key hashing); delete/adjust billing tests; contract fixtures updated.

**Exit:** core suites green with new schema (contract tests against fresh DB).

### P2 — Core account domain (auth)
- `/auth/login` (password), `/auth/logout`, `/auth/me`, `/auth/change-password`; bootstrap admin on empty DB (env-overridable default password, must-change flow enforced API-side).
- Sessions: core-issued HttpOnly cookie; flags/domain configurable so dashboard and webui can forward it (Q27).
- SSO (research 03): OIDC adapter first (authorization-code + PKCE; Authlib or openid-client), start/callback endpoints, ID-token/JWKS validation, `external_identity_links`; **no auto-provision, no email match** — unlinked identities rejected (Q26/Q28); admin pre-link field on user creation.
- Users CRUD (admin): create all grades, set/change profiles, disable, reset password.
- API keys `/v2/api-keys`: create/list/revoke for every grade; live-profile resolution at request time (Q10); hashed storage, masked display.
- Remove: guest registration, old dashboard-JWT issuance (replaced by core sessions; cleanup lands with P5), billing routes (07, step 3), per-user API-key scoping replaced by live-profile lookup.
- **Tests:** auth unit + integration (login, forced change, disable-kills-sessions-and-keys, profile-change propagates to keys, SSO reject-unlinked); contract updates.

**Exit:** full auth matrix green on the API; an admin can bootstrap, create a librarian + user, pre-link SSO, and keys enforce live profiles.

### P3 — Core knowledge domain (v2 surface)
- Documents: upload (file or URL) with attributes, grade-gated (librarian/admin); list = profile ∩ filters (`GET /v2/documents`, browsing path); get; PATCH attributes (Q8 + 05 follow-up rules); DELETE admin-only; chunks + structure endpoints.
- Attribute dictionary CRUD (admin) + read for all authenticated.
- Retrieval: `POST /v2/search` — non-empty query required, mandatory filter bag, engine params unchanged (topK/internalRecallK/rerank/agentic); scope = caller profile ∩ filters, enforced server-side; namespace params removed; retrieval cache key reworked (was `(user_id, namespace, …)`).
- Jobs: create; get own job (uploader/admin); list admin-only; admission = `MAX_CONCURRENT_JOBS` (default 4, global, env) replacing billing limits (`require_job_capacity`).
- Remove v1 namespaces/user-scoped list endpoints; webhooks kept.
- **Tests:** access-control matrix (3 grades × attribute scenarios × fail-closed edge cases: empty profile, missing keys, multi-value, strip-to-built-ins), retrieval smoke against re-uploaded demo documents, existing engine tests unchanged.

**Exit:** the v2 surface behaves exactly as the ticket-04 prototype, with the access matrix proven by tests.

### P4 — Worker hygiene
- Remove `processing_billing`; strip billing hooks from `processing_run`; remove refund path in job lifecycle and dead UserLevel code (07, step 4). `page_estimator` stays (workload estimation, not billing).
- **Tests:** worker suite green; parsing of a PDF/DOCX still produces the same chunk shapes.

**Exit:** worker green; no billing symbols remain in core (grep check).

### P5 — Admin console rework
- Stateless app: login/SSO via core; Users (grades, profiles, disable, reset, SSO pre-link), API keys (all, revoke any), Attribute dictionary (new), Job & document monitoring (default view), Webhooks (kept), Health panel, read-only settings panel, forced-change screen.
- Delete: marketing/landing pages, newsletter, billing/credits/usage-costs/buy-credits, guest, register/forgot-password, auth callbacks, better-auth + its DB, credits/subscriptions/usage routers and external-api clients (07, step 5), and the **analytics/acquisition/attribution surfaces** (D4 telemetry removal).
- **Tests:** admin suite green on the new pages; type-check/lint clean.

**Exit:** admin console runs stateless against the core API.

### P6 — WebUI rework
- Identity: login via core (password + SSO buttons); Account settings (change password + own API keys); sessions forwarded server-side; delete local users/sessions/OAuth/dashboard-SSO bridge.
- Sources panel → filtered document view (attribute chips, profile banner; active filters = chat retrieval scope); remove workspaces, members, namespace dropdown/localization, workspace cookie, encrypted key storage.
- Upload: grade-gated, attribute picker (admin any; librarian own-profile + extra for specificity), inline job progress.
- Chat: engine integration untouched; threads per user with create/switch/delete; webui DB shrinks to chat-only.
- **Tests:** webui suite green (large test churn expected); e2e login/upload/search flows.

**Exit:** webui suite green; manual feel-test passes the glitch list (D3).

### P7 — Cutover & verification
- `deploy`: env defaults updated (add `MAX_CONCURRENT_JOBS`, model defaults; drop billing keys); fresh database per clean start.
- Re-upload demo documents; smoke the whole story: bootstrap admin → forced change → create librarian/user → dictionary setup → librarian upload with attributes → profile-scoped search by each grade → admin monitoring/health → SSO login (D2 IdP).
- Zero-residue grep: billing|credit|stripe|tier|guest|namespace|telemetry across core/admin/webui (07, step 7 + D4).
- Full suites; MinerU attribution present in the UI; update `core/CONTEXT.md` + `webui/CONTEXT.md` and README to the new vocabulary.
- Merge `overhaul` → `main`, push, restart the demo stack.

**Exit:** new Ziru live on main, demo docs searchable, feel-test clean, docs current.

## Definition of done (whole overhaul)

1. No billing/credit/tier/guest/namespace residue anywhere (code, schema, config, UI, tests).
2. Account domain: 3 grades + profiles + SSO (pre-link only) + live-profile API keys, all covered by tests.
3. Knowledge domain: attribute-based, fail-closed access proven by the access matrix; engine algorithms untouched; telemetry fully removed (D4).
4. Dashboard stateless console; WebUI chat-first with filtered document view and per-user threads.
5. All three suites green; demo documents re-uploaded and searchable per profile; feel-test clean.
