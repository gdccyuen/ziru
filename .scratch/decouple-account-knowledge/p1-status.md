# P1 status — checkpoint (2026-08-19, branch `overhaul`)

Committed as `4a1961c` (plus earlier `6703f64`, `759cc70`). Live demo on `main` untouched.

**Session rule:** local commits only — **no remote pushes until the PM explicitly agrees** (see `session-rules.md`, commit `dbd4615`).

## Done
- New clean-start schema baseline (`b0d7c5e05dae`): 28 tables — users (grades/profiles/must-change-password/disabled), sessions, external_identity_links, attribute_dictionary, document_attributes, engine tables with **user_id/namespace removed**; no billing/guest/tier tables.
- Shared: profile-matching engine (fail-closed, multi-value) + 18 unit tests; configurable password policy + tests; MAX_CONCURRENT_JOBS (default 4) replacing tier admission; S3_RESULTS_BUCKET/FRONTEND_URL moved to AppConfig.
- Deleted: shared billing/credits/tier/guest/telemetry modules; app billing/guest routes+services; tier_service; worker processing_billing (replaced by processing_records); add_credits script; dashboard-JWT telemetry; middleware telemetry; billing/telemetry contract tests.
- Rate limiting reduced to Layer-0 system limits + global concurrent-job cap (require_job_capacity on /v1/jobs + /v2/jobs).

## UPDATE 2026-08-19 — P1 effectively closed

- **core API: 180 passed / 0 failed** (verified independently).
- **core worker: 173 passed / 2 failed** — the 2 failures are the PRE-EXISTING stale `test_summary_builder` unit tests (fail identically on the pre-overhaul baseline; engine untouched per Q5). Documented exception, triage separately.
- P3 decoupling is complete: publication, retrieval execution, agentic/workflow, cache, stats, API document flow all owner-less and scope-free.

## Suite state (mid-overhaul, historical)
- core API: **114 passed / 69 failed** — the failures are v1 document/retrieval flows still writing `user_id`/namespace (P3 rewires them) + a few contract fixtures to update.
- core worker: **165 passed / 10 failed** (that run predates the users.id column-width fix in `4a1961c` — likely 9 failed on rerun) — 3× Document(user_id=) (P3), 3× S3 bucket env, 3× python3.14 co_qualname util, 2× summary_builder (pre-existing).
- admin/webui suites: untouched on this branch. Webui (tests/typecheck/lint) green at baseline; admin tests + type-check green, but **admin lint has 2 pre-existing issues** in marketing/landing files (deleted in P5).

## Next session
1. **P3 front-load:** update document ingestion/publication + retrieval scoping to the owner-less schema (drop user_id/namespace from Document construction and queries; adapt document/job/retrieval contract tests; then the access-control matrix).
2. Finish worker env-dependent tests (S3 buckets in test env; co_qualname util).
3. Then P2 (account API: login/sessions/users/keys/SSO seam) per docs/OVERHAUL.md.
