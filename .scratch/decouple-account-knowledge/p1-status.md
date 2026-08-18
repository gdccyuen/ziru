# P1 status — checkpoint (2026-08-19, branch `overhaul`)

Committed as `4a1961c` (plus earlier `6703f64`, `759cc70`). Live demo on `main` untouched.

## Done
- New clean-start schema baseline (`b0d7c5e05dae`): 28 tables — users (grades/profiles/must-change-password/disabled), sessions, external_identity_links, attribute_dictionary, document_attributes, engine tables with **user_id/namespace removed**; no billing/guest/tier tables.
- Shared: profile-matching engine (fail-closed, multi-value) + 18 unit tests; configurable password policy + tests; MAX_CONCURRENT_JOBS (default 4) replacing tier admission; S3_RESULTS_BUCKET/FRONTEND_URL moved to AppConfig.
- Deleted: shared billing/credits/tier/guest/telemetry modules; app billing/guest routes+services; tier_service; worker processing_billing (replaced by processing_records); add_credits script; dashboard-JWT telemetry; middleware telemetry; billing/telemetry contract tests.
- Rate limiting reduced to Layer-0 system limits + global concurrent-job cap (require_job_capacity on /v1/jobs + /v2/jobs).

## Suite state (mid-overhaul, expected)
- core API: **114 passed / 69 failed** — the failures are v1 document/retrieval flows still writing `user_id`/namespace (P3 rewires them) + a few contract fixtures to update.
- core worker: **165 passed / 10 failed** — 3× Document(user_id=) (P3), 3× S3 bucket env, 3× python3.14 co_qualname util, 1× summary_builder (pre-existing).
- admin/webui suites: untouched (still green on main).

## Next session
1. **P3 front-load:** update document ingestion/publication + retrieval scoping to the owner-less schema (drop user_id/namespace from Document construction and queries; adapt document/job/retrieval contract tests; then the access-control matrix).
2. Finish worker env-dependent tests (S3 buckets in test env; co_qualname util).
3. Then P2 (account API: login/sessions/users/keys/SSO seam) per docs/OVERHAUL.md.
