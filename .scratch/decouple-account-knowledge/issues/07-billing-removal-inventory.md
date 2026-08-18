# 07 — Billing & Credits Removal Inventory

Type: task
Status: resolved
Resolved: 2026-08-18 (background subagent deliverable reviewed)
Blocked by: —

## Question

Produce the complete removal inventory for billing and credits:

- Every piece of billing/credit/tier/guest code, database table, config key, test, and UI surface across core, admin, and webui.
- Blast radius: what imports, contracts, and tests reference the removed pieces.
- What rate-limit/admission machinery remains after removal, and where the simple concurrent-job cap should live (Q4).
- A recommended deletion order that keeps the engine test suites green at every step.

Deliverable: inventory written to `.scratch/decouple-account-knowledge/research/billing-removal-inventory.md` on main — facts that later tickets and implementation rely on.

## Answer

Inventory complete (382 lines, static analysis only — no code/schema/test changes). Full detail: `research/billing-removal-inventory.md`. Highlights:

**Deleted:** core `/v1/billing` (8 endpoints incl. Stripe webhook) + `/v1/guest`; services billing/guest/tier; repos payment_record/stripe_price_config/guest_device; scripts add_credits + billing parts of init_user; config keys (BILLING_ENABLED, STRIPE_*, MICRO_DOLLARS_PER_PAGE, CREDITS_VALID_DAYS, FREE_PLAN_INITIAL_CREDITS, MOESIF_APPLICATION_ID, TOKEN_PRICING_TABLE_JSON); rate-limit layers for tier RPM + daily quota + guest-key scope (system limits stay). DB (clean-start baseline): credits_transactions, payment_records, stripe_price_configs, user_balances, tier_limits, guest_devices; jobs.credits_charged + jobs.billing_status columns (jobs.page_count stays). Shared: core/billing, billing config (after moving S3_RESULTS_BUCKET + FRONTEND_URL, which are NOT billing-only), services/billing, credits repos, billing/guest/tier models+schemas, billing error codes/exceptions, token_costing, telemetry billing fields, zip-manifest billing fields, refund path in jobs/lifecycle. Worker: processing_billing entirely; billing hooks stripped from processing_run (page_estimator stays). Admin: billing dir, buy-credits page, credits/subscriptions/usage oRPC routers + external-api clients, use-credits, lib/billing.ts, checkout analytics, BILLING_ENABLED plumbing, credits UI in usage console (table stays). WebUI: dead type/prop surface only (creditsSpent, billingStatus/ProcessingCost in sdk types, unused userTierLabel prop).

**Remains:** system_limits + RateLimiter.check_system_limit (per-route RPM), RATE_LIMIT_ENABLED, job-concurrency counter; all engine machinery untouched.

**Concurrent-job cap (Q4) — recommendation:** new env key `MAX_CONCURRENT_JOBS` (int, default 4, 0/-1 = unlimited) in shared/core/config/job.py; enforced in JobAdmissionCapacityService (rename enforce_job_capacity), reusing the non-terminal-job count; new require_job_capacity dependency replaces require_billing_limits on POST /v1/jobs + /v2/jobs; single GLOBAL cap by default (per-user = one-line change later).

**Deletion order (7 steps, suites green at each):** 1) schema/migrations + schema contract tests, 2) shared library, 3) core API + tests, 4) worker + tests, 5) admin, 6) webui, 7) contracts/SDK/telemetry hygiene + zero-residue grep.
