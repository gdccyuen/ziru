# 07 — Billing & Credits Removal Inventory

**Status:** complete · **Method:** static analysis only (no code changed, no tests run)
**Scope trees:** `core/apps/api`, `core/packages/shared-python/shared`, `core/apps/worker`, `admin/`, `webui/src`
**Companion docs:** [map.md](../map.md) · [issue 07](../issues/07-billing-removal-inventory.md)

---

## 1. Scope & method

### What was scanned
- **Core API** (`core/apps/api`): route registries (`app/api/v1/api_v1.py`, `app/api/v2/routes/*`), all route modules, dependencies (`app/api/dependencies/*`), services (`app/services/billing/*`, `app/services/guest/*`, `app/services/rate_limit/*`, `app/services/jobs/*`, `app/services/document_ingestion/*`, `app/services/demo/*`, `app/services/s3_events/*`, `app/services/auth/*`), repositories, scripts (`scripts/*`), Alembic migrations (`alembic/versions/*`), tests (`tests/contract/*`, `tests/unit/*`, `tests/migrations/*`, `tests/support/*`).
- **Shared library** (`core/packages/shared-python/shared`): `core/billing`, `core/config/billing.py` + `core/config/ai.py` (token pricing), `core/response/ErrorCode.py`, `core/exceptions`, `core/celery_router.py`, `models/database` + `models/schemas`, `repositories/credits*`, `services/billing`, `services/quota`, `services/jobs/lifecycle`, `services/storage/zip_manifest_schema.py`, `services/telemetry`, `services/ai/token_costing.py`, `testing/contract_runtime.py`, `tests/*`.
- **Worker** (`core/apps/worker`): `services/document_ingestion/*` (page estimator, processing billing, processing run, success finalization, parse execution), `services/document_agent/*` and `services/document_parser/*` checked only for billing hooks, worker tests.
- **Admin** (`admin/`): dashboard app pages (`app/(dashboard)/billing`, `usage`, `api-keys`, `settings`, `webhooks`, `_components`), landing pages (`app/(landing)`, `app/_(landing)`) — flagged only where they carry pricing/billing copy, server routers + external-api clients (`server/routers/{credits,subscriptions,usage}.ts`, `server/external-api/{credits,subscriptions,usage}.ts`), `hooks/`, `lib/`, `providers/`, `store/`, `utils/`, Drizzle schema/migrations (`lib/db`, `drizzle/*.sql`), tests (`*.test.ts*`), i18n (`i18n/locales/*.json`).
- **WebUI** (`webui/src`): full keyword scan of `src` incl. `integrations/ziru-sdk-types.ts`, components, routes, tests.

### What was excluded
`.venv`, `node_modules`, `.next`, `dist`, `build`, `MinerU/` (vendored third-party), and all engine internals (retrieval, parsing, chunking, agentic budgets, token *usage tracking*). Engine-adjacent "quota/token/usage" names that are **not** billing were verified and excluded, e.g.:
- `shared/services/quota/token_pool.py`, `shared/services/ai/token_tracking.py`, `shared/services/ai/page_memory_vlm_limiter.py`, `worker/.../document_agent/budget.py` — model-context / agent token budgets, not credits.
- `shared/services/ai/iloveapi_quota_manager.py`, `worker/.../providers/mineru/quota_manager.py` — third-party provider key pools (iLoveAPI/MinerU), not Ziru billing.
- `core/apps/api/app/services/s3_events/subscription_service.py` — AWS SNS subscription confirmation, **not** billing (keep).
- `admin/lib/db/schema.ts` + Drizzle `0006/0007` — "subscription" here is the email **newsletter** opt-in (keep).
- CSS class `text-balance` matched `balance` in `components/ui/empty.tsx` (false positive — keep).
- WebUI "guest" test names (`chat-composer.test.ts`, `chat-panel.test.ts`, `posthog.test.ts`) refer to the *logged-out* composer/analytics identity, not the guest-device mode (keep).
- `worker/.../test_html_parser_contract.py` "enterprise product tier" is fixture HTML (keep).

---

## 2. Removal inventory

### 2.1 Core API

#### Routes / route registrations

| Piece | Path | Action |
|---|---|---|
| Billing router (7 endpoints: buy-credits, credits, usage, parse-usage, history, price-configs, buy-credits-package, Stripe webhook) | `core/apps/api/app/api/v1/routes/billing.py` | Delete file |
| Guest registration route | `core/apps/api/app/api/v1/routes/guest.py` | Delete file |
| Route registration + `settings.BILLING_ENABLED` gate | `core/apps/api/app/api/v1/api_v1.py` | Remove `guest` import/include and the conditional `billing` include (engine routes unchanged) |
| Job-creation dependencies | `core/apps/api/app/api/v1/routes/jobs.py`, `core/apps/api/app/api/v2/routes/jobs.py` | Replace `require_billing_limits` dependency with a job-capacity dependency (see §4) |

#### Services (delete whole directories/files)

| Piece | Path |
|---|---|
| Billing command workflow | `core/apps/api/app/services/billing/billing_command_workflow.py` |
| Billing read model (+ `ParseUsageResponse`) | `core/apps/api/app/services/billing/billing_read_model.py` |
| Billing workflow facade | `core/apps/api/app/services/billing/billing_workflow_service.py` |
| Price config service | `core/apps/api/app/services/billing/price_config_service.py` |
| Stripe purchase / webhook / credits settlement / refund reconciliation | `core/apps/api/app/services/billing/stripe_purchase_service.py`, `stripe_webhook_service.py`, `stripe_credits_settlement_service.py`, `stripe_refund_reconciliation_service.py` |
| Guest registration | `core/apps/api/app/services/guest/guest_registration_service.py` (whole `services/guest/` dir) |
| Tier resolution | `core/apps/api/app/services/rate_limit/tier_service.py` |

#### Rate-limit services (mixed — surgical edits, see §4)

| File | Remove | Keep |
|---|---|---|
| `services/rate_limit/data_structures.py` | `TierLimits`, `CurrentUser.user_tier` field | `CurrentUser.user_id`, `RouteAdmissionContext`, `SystemLimitRule` |
| `services/rate_limit/config.py` | `tier_map` storage/update in `update_rules`, tier-related logging | `system_rules`, limits-library strategies, `RATE_LIMIT_ENABLED`, namespacing |
| `services/rate_limit/rule_loader.py` | `_fetch_tier_map` + `tier_limits` query | `_fetch_system_rules` from `system_limits` |
| `services/rate_limit/job_admission_service.py` | `TierService.get_tier`, `enforce_billing_limits` | `resolve_current_user` (user_id only), `enforce_route_system_limit`, `enforce_job_creation_capacity` |
| `services/rate_limit/job_admission_route_policy_service.py` | `enforce_guest_api_key_scope` + guest route patterns + `/v1/billing/credits` + permission string | `enforce_user_system_limit`, `enforce_route_system_limit` |
| `services/rate_limit/job_admission_capacity_service.py` | `enforce_billing_limits`, tier RPM/daily-quota branches, `UserBalance` row lock, `_compute_concurrency_retry_after_seconds(rpm)` | job-concurrency counting (`_count_non_terminal_jobs`, `_ACTIVE_JOB_STATES`) — re-targeted to a single global cap (see §4) |
| `services/rate_limit/limiter.py` | `check_billing_rpm` (Layer 1), `check_daily_quota` (Layer 3) | `check_system_limit` (Layer 0) |
| `services/rate_limit/__init__.py` | `TierLimits` export, tier docstring lines | `CurrentUser`, `SystemLimitRule`, `RateLimitConfig`, `RateLimiter`, `find_system_rule` |

#### Dependencies

| File | Action |
|---|---|
| `app/api/dependencies/job_admission.py` | Remove `require_billing_limits`; add job-capacity dependency (keeps `require_route_system_limit`) |
| `app/api/dependencies/current_user.py` | `resolve_current_user` no longer resolves tier — plain user-id to `CurrentUser(user_id=...)` |
| `app/api/dependencies/route_admission.py`, `auth.py` | Unchanged |

#### Repositories

| Piece | Path | Action |
|---|---|---|
| Payment records | `core/apps/api/app/repositories/payment_record_repository.py` | Delete |
| Stripe price config | `core/apps/api/app/repositories/stripe_price_config_repository.py` | Delete |
| Guest devices | `core/apps/api/app/repositories/guest_device_repository.py` | Delete |
| Exports | `core/apps/api/app/repositories/__init__.py` | Unchanged (never exported the deleted repos) |

#### Scripts

| Piece | Path | Action |
|---|---|---|
| Add-credits admin script | `core/apps/api/scripts/add_credits.py` | Delete |
| User bootstrap script | `core/apps/api/scripts/init_user.py` | Strip credits/tier init (`_initialize_user_credits`, `--tier`, `CreditsService`, `UserBalance`, `_DEFAULT_USER_TIER`) — keep user + API-key creation |
| Other scripts | `ensure_test_environment.py`, `log_manager.py`, `reset_alembic.py`, `validate_demo_documents.py` | Unchanged (verify `ensure_test_environment.py` does not seed `user_balances`/tiers during implementation) |

#### API services with billing hooks (mixed — edit, do not delete)

| File | Remove | Keep |
|---|---|---|
| `app/services/jobs/result_projection.py` | `_resolve_credits_spent`, `_CHARGED_BILLING_STATUS`, `MicroDollar` import, `credits_spent=...` arg | All other job-result projection |
| `app/services/demo/source_materializer.py` | `credits_charged=0`, `billing_status="skipped"` on demo `Job` rows | Demo materialization itself |

#### Config keys

| Key | Defined in | Action |
|---|---|---|
| `BILLING_ENABLED` | `shared/core/config/billing.py` | Delete (used by `api_v1.py`, rate-limit capacity, telemetry, worker, admin) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `shared/core/config/billing.py` | Delete |
| `MICRO_DOLLARS_PER_PAGE`, `CREDITS_VALID_DAYS`, `FREE_PLAN_INITIAL_CREDITS` | `shared/core/config/billing.py` | Delete |
| `MOESIF_APPLICATION_ID` | `shared/core/config/billing.py` | Delete (no non-venv consumers) |
| `TOKEN_PRICING_TABLE_JSON` | `shared/core/config/ai.py` | Delete — billing-only (see `token_costing.py` below) |
| `S3_RESULTS_BUCKET`, `FRONTEND_URL` | live inside `BillingConfig` but **not** billing-only | **Move** into `StorageConfig` (S3 bucket) / app or storage config (frontend URL) before deleting `BillingConfig` |
| `validate_billing_config` | `config/app.py` `validate_all` | Drop from validation list |

#### DB models / tables (shared models — see §2.3)

Tables to remove from the new schema: `credits_transactions`, `payment_records`, `stripe_price_configs`, `user_balances`, `tier_limits`, `guest_devices`; columns `jobs.credits_charged`, `jobs.billing_status` (keep `jobs.page_count`). Table `system_limits` **stays** (remove only the guest-registration system-limit row).

#### Alembic migrations

| Migration | Content | Action |
|---|---|---|
| `33eff537939b_baseline_20260305.py` | Baseline creating `credits_transactions`, `payment_records`, `stripe_price_configs`, `user_balances`, `tier_limits` (+ seed rows), `jobs.credits_charged`/`billing_status` | Map says **clean start, new schema, no migration** — the new baseline must omit all billing tables/columns; retire this file (or edit it to the new baseline) |
| `b2c3d4e5f6a7_add_guest_registration.py` | `guest_devices`, guest tier seed, guest system-limit row, `system_limits.period` column | Delete (note: `system_limits.period` was introduced here — preserve that column in the new baseline) |
| `fbe1c2d3e4f5_add_v2_job_polling_system_limit.py` | v2 job-polling system limit | Keep |
| `8ffba9132ff0_add_partial_index_for_active_job_.py` | Active-job index | Keep (index definition may drop if it references removed columns — verify) |
| All others (`a1b2c3d4e5f6`, `c3d4e5f6a7b8`, `d4e5f6a7b8c9`, `e5f6a7b8c9d0`, `f0d85d209e68`, `f6a7b8c9d0e1`, `f7a8b9c0d1e2`, `f8a9b0c1d2e3`, `f9a0b1c2d3e4`, `f9b0c1d2e3f4`, `f9c0d1e2f3a4`, `f9d0e1f2a3b4`, `fae1b2c3d4e5`, `fce1c2d3e4f6`) | Engine/account tables | Keep |

---

### 2.2 Worker

| File | Action | Details |
|---|---|---|
| `core/apps/worker/app/services/document_ingestion/processing_billing.py` | **Delete file** | `charge_parse_job_pages`, `record_skipped_parse_job_billing`, `ParseJobBillingSnapshot` — whole billing boundary |
| `core/apps/worker/app/services/document_ingestion/processing_run.py` | Edit (mixed) | Remove imports/calls of `charge_parse_job_pages` / `record_skipped_parse_job_billing` and `billing_snapshot` plumbing in `record_processing_start`. **Keep** `PageEstimator.estimate_workload` (page_count drives the oversized-PDF rejection) and all engine parse steps |
| `core/apps/worker/app/services/document_ingestion/page_estimator.py` | Keep (re-scope) | Page counting feeds oversized-PDF policy + telemetry `pages_processed_24h`. Rewrite docstrings/comments ("billing purposes" to workload estimation); keep `WorkloadEstimate` shape (it has no billing fields) |
| `record_processing_start` job_metadata | Edit | Drop `billing_status`, `billing_amount_micro_dollars`, `billing_credits` keys; keep `page_count`, `workload_estimate_method`, `workload_estimate_fallback_reason`, `processing_started_at` |
| `success_finalization.py`, `parse_execution.py`, `job_state_gate.py` etc. | No change | No billing logic found (verified) |
| `shared/services/jobs/lifecycle/failure_finalizer.py` (used by worker) | Edit | Remove `SyncCreditsService` refund path (`_try_refund_credits`, `should_refund` handling, `job.billing_status="refunded"`); keep state-machine + webhook outbox finalization |
| `shared/services/jobs/lifecycle/service.py` | Edit | Remove `should_refund` param/default and refund call-through (lines approx. 98-120) |
| Celery routing (`shared/core/celery_router.py`) | Edit (dead billing vestige) | `UserLevel` enum (VIP/PREMIUM/STANDARD/BASIC), `user_level_weights`, `calculate_priority`, `create_task_context` have **zero callers** (verified). Remove them and the "subscription-aware" docstring; **keep** `get_queue_for_job` type-to-queue mapping used by `worker_dispatcher.py` |
| Worker tests | see §3 | `test_parse_task_contract.py` (billing-charge test), `test_webhook_recovery_contract.py` (`billing_status="charged"` fixtures), `tests/support/contract_database.py`, `tests/support/worker_parse_contract.py` (`use_billing`, `observe_user_billing`, billing columns) |

---

### 2.3 Shared library (`core/packages/shared-python/shared`)

#### Billing domain packages (delete)

| Piece | Path |
|---|---|
| Micro-dollar value object + per-page calculator | `shared/core/billing/` (whole dir: `__init__.py`, `micro_dollar.py`, `calculator.py`) |
| Billing config | `shared/core/config/billing.py` (after moving `S3_RESULTS_BUCKET`/`FRONTEND_URL`) |
| Credits ledger services (async + sync) | `shared/services/billing/credits_service.py`, `credits_sync_service.py` |
| Work billing boundary | `shared/services/billing/work_billing_service.py` |
| Billing package exports | `shared/services/billing/__init__.py` |
| Credits repositories | `shared/repositories/credits_repository.py`, `credits_sync_repository.py`; exports in `shared/repositories/__init__.py` |
| Token cost estimation | `shared/services/ai/token_costing.py` (+ `TOKEN_PRICING_TABLE_JSON` config) — cost estimates are written only into `zip_manifest_schema` `cost_estimate` and read nowhere (verified); billing-only |

#### DB models (delete files + exports)

| Model / file | Table |
|---|---|
| `shared/models/database/credits_transaction.py` | `credits_transactions` |
| `shared/models/database/payment_record.py` | `payment_records` |
| `shared/models/database/stripe_price_config.py` | `stripe_price_configs` |
| `shared/models/database/user_balance.py` | `user_balances` |
| `shared/models/database/tier_limit.py` | `tier_limits` |
| `shared/models/database/guest_device.py` | `guest_devices` |
| `shared/models/database/job.py` | **Edit:** remove `credits_charged` + `billing_status`; **keep** `page_count` (telemetry + oversized-PDF policy) |
| `shared/models/database/__init__.py`, `shared/models/__init__.py` | Remove exports: `CreditsTransaction`, `GuestDevice`, `PaymentRecord`, `StripePriceConfig`, `TierLimit`, `UserBalance` (keep `SystemLimit`, `User`, engine models) |

#### Schemas (delete / edit)

| File | Action |
|---|---|
| `shared/models/schemas/billing.py` | Delete (SubscribeRequest, BuyCredits*, CreditsBalance, UsageStats, TransactionHistory, PaymentIntent, CheckoutSession) |
| `shared/models/schemas/guest.py` | Delete (GuestRegisterRequest/Response, GuestRateLimitInfo) |
| `shared/models/schemas/job.py` | Remove `credits_spent` from `JobResultResponse` |
| `shared/models/schemas/dashboard.py` | Delete — `OverviewResponse`/`UsageAnalyticsResponse`/`DashboardStatsResponse` have **no importers** anywhere (verified dead) |

#### Exceptions / error codes (edit)

| File | Action |
|---|---|
| `shared/core/exceptions/domain_exceptions.py` | Delete `InsufficientCreditsException`, `QuotaExceededException`, `StripeServiceException`; update `RateLimitException` docstring (remove tier examples) — exception class itself **stays** |
| `shared/core/exceptions/__init__.py` | Drop `QuotaExceededException` export (billing ones were never exported here) |
| `shared/core/response/ErrorCode.py` | Remove `PAYMENT_REQUIRED` (402), `SubCode.QUOTA_EXCEEDED`; remove 402 mappings; update "Quota Exceeded / upgrade plan" retry-semantics docs — `RESOURCE_EXHAUSTED` stays for rate limits |

#### Telemetry (edit — remove only billing-linked parts)

| File | Remove | Keep |
|---|---|---|
| `shared/services/telemetry/config.py` | `BILLING_ENABLED: bool` field | rest |
| `shared/services/telemetry/events.py` | `billing_enabled` base/instance property, `_BASE_PROPERTY_NAMES` entry, `credits_charged_24h` in `oss_usage_aggregate`, `build_instance_event_properties(..., billing_enabled=...)` / `build_base_event_properties` entries | rest of event shapes |
| `shared/services/telemetry/runtime.py` | `billing_enabled=self._settings.BILLING_ENABLED` args (3 sites) | heartbeat loop |
| `shared/services/telemetry/aggregates.py` | `credits_charged_24h` SQL aggregate | `pages_processed_24h` (uses `jobs.page_count` — stays) and all other aggregates |

#### Manifest / storage (edit)

| File | Remove | Keep |
|---|---|---|
| `shared/services/storage/zip_manifest_schema.py` | `billing_status`, `cost: {micro_dollars, credits}`, `cost_estimate` + `build_token_cost_estimate` import | token-usage snapshot, timing, page stats |

#### Test infrastructure (edit)

| File | Action |
|---|---|
| `shared/testing/contract_runtime.py` | Remove `tier_limits` from required tables, `user_balances` from expected tables, `shared.core.config.billing` from contract modules, `shared.services.billing.*` ignores, `STRIPE_*`/`BILLING_ENABLED` env seeding, `CONTRACT_DEVELOPER_USER_TIER` + tier assertions |

---

### 2.4 Admin (`admin/`)

#### Pages (delete / edit)

| Piece | Path | Action |
|---|---|---|
| Billing page | `app/(dashboard)/billing/page.tsx` + `_components/{buy-credits-dialog,buy-credits-modal,subscription-card}.tsx` + `_hooks/use-subscription.ts` | **Delete whole `app/(dashboard)/billing/` dir** |
| Buy-credits deep-link page | `app/(dashboard)/usage/buy-credits/page.tsx` | Delete (also remove `?buy=true` handling in `dashboard-client.tsx`) |
| Usage console | `app/(dashboard)/usage/page.tsx` | **Keep** (job/document monitoring is engine); remove: `useCredits`, `useUsageStats`/`useParseUsage`, credits/cost summary cards, buy-credits button + `trackBuyCreditsClicked`, `billingEnabled` conditionals, "Usage & Billing" title — always use the self-hosted title |
| Usage table | `usage/_components/usage-table.tsx` + `usage/_hooks/use-jobs.ts` | Keep table; remove `cost` column, `formatCostLabel`, `cost: job.credits_spent ?? result_metadata?.cost ?? 0` mapping |
| Usage stats hooks | `usage/_hooks/use-usage-stats.ts` | Delete (billing stats only) |
| Usage welcome modal | `usage/_components/usage-welcome-modal.tsx` | Keep (welcome + API-key provisioning); remove `freeCredits` copy |
| Dashboard shell / header / client | `_components/dashboard-shell.tsx`, `header.tsx`, `dashboard-client.tsx` | Remove `CreditsButton`, `BuyCreditsModal`/`BuyCreditsDialog`, `useCredits`, `creditsIconSrc` prop, `isBuyCreditsOpen` prop, `PaymentRedirectTracking` mounts, `billingEnabled` gating |
| Per-section shells | `api-keys/settings/webhooks/usage` `*_dashboard-shell.tsx` | Keep shells; drop `isBuyCreditsOpen` + `creditsIconSrc` props |
| Sidebar | `_components/sidebar.tsx` | Keep (no /billing nav item exists; /usage stays) |
| Design constants | `_components/dashboard-dialog-design.ts` | Remove `formatBuyCreditsDisplayAmount`/`BuyCreditsDisplayAmountOptions`; keep `usageWelcome` + `actionButton` |
| Landing marketing | `app/(landing)/*`, `app/_(landing)/*` (pricing-section.tsx, cta-section.tsx, comparison-showcase.tsx, hero-playground.tsx, why-choose-showcase.tsx, integrate-code-panel.tsx, landing-home-data.ts `PriceExample`, versus/claw pages) | Billing/pricing marketing copy — flag for product decision; at minimum remove pricing/credit claims (outside the strict dashboard scope, listed for completeness) |

#### Server routers + external API clients (delete)

| Piece | Path |
|---|---|
| oRPC routers | `server/routers/credits.ts`, `server/routers/subscriptions.ts`, `server/routers/usage.ts` |
| Router wiring | `server/routers/index.ts` — drop `credits`/`subscriptions`/`usage` entries (keep `apiKeys`, `users`, `jobs`, `newsletter`, `webhookSecrets`) |
| External API clients | `server/external-api/credits.ts`, `server/external-api/subscriptions.ts`, `server/external-api/usage.ts`, and their exports in `server/external-api/index.ts` |

#### Hooks / lib / providers (delete / edit)

| Piece | Path | Action |
|---|---|---|
| Credits hook | `hooks/use-credits.ts` | Delete |
| Billing flag helper | `lib/billing.ts` | Delete |
| Payment-redirect tracking hook + provider | `hooks/use-payment-redirect-tracking.ts`, `providers/payment-redirect-tracking.tsx` | Delete |
| Checkout analytics | `lib/posthog-checkout.ts`, `lib/analytics/payment-redirect.ts`, `lib/analytics/client-state.ts` (checkout parts), `lib/analytics/types.ts` (`CheckoutType`, `PendingCheckout`, `billing.*` events) | Delete checkout/billing parts; keep auth analytics |
| PostHog billing trackers | `lib/posthog.ts` — `trackCreditsPurchased`, `trackSubscriptionPurchased`, `trackCheckoutPurchaseUnknown`, `trackCheckoutStarted`, `trackCheckoutCanceled`, `trackBuyCreditsClicked` | Remove (keep generic `trackFeatureUsage`, `trackError` etc.) |
| Config plumbing | `lib/config.ts` (`billingEnabled` field + `isBillingEnabled()`), `providers/config-provider.tsx` (`billingEnabled: false` default) | Remove |
| Env | `lib/env.ts` — `BILLING_ENABLED` schema + default | Remove |
| Format helper | `utils/format.ts` — `formatCredits` | Remove (no callers — verified) |

#### Store / Drizzle

| Piece | Action |
|---|---|
| `store/timezone-store.ts` | Keep (no billing) |
| `lib/db/schema.ts` + `drizzle/*.sql` + `drizzle-newsletter` | **Nothing to remove** — admin DB holds no billing tables; the only "subscription" matches are the newsletter opt-in (keep) |

#### i18n

| File | Action |
|---|---|
| `i18n/locales/en.json`, `zh.json` | Remove `Billing`, `BuyCredits`, `Pricing`, `UsageWelcome.freeCredits`, and the credits/cost keys in `Usage` (`totalCredits`, `totalCreditsUsed`, `remainingCredits`, `availableBalance`, `totalCost`, `estCost`, `cost` in `UsageTable`); keep job-monitoring keys (`totalRequests`, `totalPages`, `successRate`, `recentRecords`, ...) and `UsageTable` rows except `cost` |

#### Admin tests (blast radius — see §3)

---

### 2.5 WebUI (`webui/src`)

Verified: **no runtime billing/credit/guest-mode logic**. The only references are type-only surface copied from the old SDK, plus an unused display prop:

| Piece | Path | Action |
|---|---|---|
| `JobResult.creditsSpent` | `webui/src/integrations/ziru-sdk-types.ts` (line approx. 102) | Remove (no consumers — verified) |
| `ProcessingMetadata.billingStatus`, `ProcessingCost{microDollars, credits}`, `ProcessingMetadata.cost` | `ziru-sdk-types.ts` (lines approx. 569-591) | Remove (no consumers — verified) |
| `TopNavProps.userTierLabel` + render branch | `webui/src/components/top-nav.tsx` | Remove (only consumer `workspace-shell-layout.tsx` never passes it; tests don't cover it) |
| `top-nav.test.ts` | — | No billing assertions; unchanged |

---

## 3. Blast radius

### Python imports that break when the shared billing package disappears
- `shared.core.billing` (MicroDollar, BillingCalculator): `app/services/billing/*`, `app/services/jobs/result_projection.py`, `scripts/add_credits.py`, `tests/contract/test_billing_contract.py`.
- `shared.services.billing` (CreditsService, SyncCreditsService, WorkBillingService): `app/services/billing/*`, `app/services/guest/guest_registration_service.py`, `app/services/rate_limit/tier_service.py`, `scripts/init_user.py`, `scripts/add_credits.py`, `shared/services/jobs/lifecycle/failure_finalizer.py`, `worker/.../processing_billing.py`, `shared/testing/contract_runtime.py`.
- `shared.repositories.credits_*`: `shared/services/billing/*`, `app/services/billing/stripe_purchase_service.py`.
- `shared.models.database.{CreditsTransaction,PaymentRecord,StripePriceConfig,UserBalance,TierLimit,GuestDevice}`: all of the above plus `app/services/rate_limit/{rule_loader,tier_service,job_admission_capacity_service}.py`, `models/__init__`, `tests/support/contract_database.py` (api + worker).
- `shared.models.schemas.{billing,guest}`: billing/guest routes, `billing_read_model.py`, `billing_command_workflow.py`, admin external-api types.
- `shared.services.ai.token_costing`: `shared/services/storage/zip_manifest_schema.py`.

### Contract / SDK surface that changes
- **Core API response contracts:** `JobResultResponse.credits_spent` removed — API contract tests that assert it (`tests/contract/test_job_read_contract.py`) and any SDK-generated types (`webui/.../ziru-sdk-types.ts`) must drop the field.
- **Error contract:** `PAYMENT_REQUIRED` (402) and `QUOTA_EXCEEDED` sub-code removed from `ErrorCode`; HTTP 402 no longer produced (only `InsufficientCreditsException` raised it).
- **Routes removed:** `/v1/billing/*`, `/v1/guest` — admin external-api clients (`credits.ts`, `subscriptions.ts`, `usage.ts`) and admin routers must be deleted together; nothing in webui calls them.
- **Telemetry event schema:** `billing_enabled` property and `credits_charged_24h` aggregate removed from self-hosted telemetry events (`test_self_hosted_telemetry_contract.py` updated).
- **Job ZIP manifest:** `processing.billingStatus`, `processing.cost`, `cost_estimate` removed (manifest consumers in webui don't read them — verified).

### Core test files affected (keep the engine suites green)
| File | Action |
|---|---|
| `core/apps/api/tests/contract/test_billing_contract.py` | Delete |
| `core/apps/api/tests/contract/test_guest_registration_contract.py` | Delete |
| `core/apps/api/tests/contract/test_job_rate_limit_contract.py` | Rework: drop tier_limits seeding / `BILLING_ENABLED`; test system limits + the new concurrent-job cap |
| `core/apps/api/tests/contract/test_job_creation_contract.py` | Remove `credits_charged`/`billing_status` inserts |
| `core/apps/api/tests/contract/test_documents_contract.py` | Same column removal |
| `core/apps/api/tests/migrations/test_schema_contract.py` | Same column removal |
| `core/apps/api/tests/contract/test_demo_documents_contract.py` | Drop credits/billing_status assertions on demo jobs |
| `core/apps/api/tests/contract/test_job_read_contract.py` | Drop `credits_spent` assertions incl. refunded-job test |
| `core/apps/api/tests/contract/test_page_memory_parse_track_contract.py` | Remove guest-route-policy test case |
| `core/apps/api/tests/contract/test_self_hosted_telemetry_contract.py` | Remove `BILLING_ENABLED` property expectation |
| `core/apps/api/tests/unit/test_job_poll_session_hygiene.py` | Delete (tests `TierService` session reuse; concept disappears) or re-target at plain user resolution |
| `core/apps/api/tests/support/contract_database.py` | Remove `insert_user_balance` helper + call site |
| `core/apps/worker/tests/contract/test_parse_task_contract.py` | Remove billing-charge test + `use_billing`; keep parse tests (`billing_status "skipped"` assertions drop) |
| `core/apps/worker/tests/contract/test_webhook_recovery_contract.py` | Remove `billing_status="charged"` from fixtures |
| `core/apps/worker/tests/support/contract_database.py` | Remove billing columns |
| `core/apps/worker/tests/support/worker_parse_contract.py` | Remove `use_billing`, `observe_user_billing`, billing columns |
| `shared/testing/contract_runtime.py` | See §2.3 |
| `shared/tests/*` | No billing tests (verified) |

### Admin tests (guardrail: 108 tests)
| File | Action |
|---|---|
| `admin/lib/posthog-checkout.test.ts` | Delete |
| `admin/lib/dashboard-dialog-design.test.ts` | Remove buy-credits case (or delete with component) |
| `admin/lib/auth-redirect.test.ts` | Remove `/billing`, `/settings/billing` protected-path expectations |
| `admin/lib/analytics/client-state.test.ts` | Remove checkout-state cases |
| `admin/lib/landing-localization.test.ts` | Remove pricing/credit string expectations if present |
| `admin/lib/usage-table-contract.test.ts` | Keep (jobs-table contract; verified no billing refs) |
| `admin/lib/ziru-sdk-examples.test.ts`, `newsletter-service.test.ts`, `openai-ads.test.ts` etc. | Keep |

### Config / env blast radius (outside the five trees, for the implementer)
- `core/apps/api/.env.example` (lines approx. 134-137): `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MOESIF_APPLICATION_ID`.
- `core/apps/worker/.env.example` (lines approx. 102-105): same four keys.
- `admin/.env.example` (line 13): `BILLING_ENABLED=false`.
- `deploy/.env.defaults` (lines approx. 36, 214-216): `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`; also mirrored under `deploy/.build/sources/*`.
- Add the new `MAX_CONCURRENT_JOBS` env key (see §4) to all three env examples + deploy defaults.

---

## 4. What remains after removal

### Rate-limit / job-admission machinery that survives (engine-side, keep)
- **System (per-route) rate limits:** `system_limits` table, `SystemLimitRule` + `find_system_rule`, `RateLimitConfig` (Redis-backed limits-library strategies), `RateLimiter.check_system_limit`, `enforce_user_system_limit` / `enforce_route_system_limit`, `RATE_LIMIT_ENABLED` env toggle, `RouteAdmissionContext` dependency chain.
- **Job concurrency counting:** `JobAdmissionCapacityService._count_non_terminal_jobs` over `_ACTIVE_JOB_STATES` (waiting-file/pending/running/converting) — this is the mechanism the simple cap should keep using.
- **Everything else:** job state machine, webhook outbox, demo materialization, S3 SNS ingestion, telemetry (minus billing fields), auth/API-key services, Celery queue routing (`get_queue_for_job`), all engine services.

### Removed with billing (recap)
`/v1/billing/*` + `/v1/guest` routes, Stripe services + webhook, credits ledger (async + sync), micro-dollar calculator, tier service + tier map, per-user RPM/daily-quota layers, guest devices/keys, billing config keys (`BILLING_ENABLED`, `STRIPE_*`, `MICRO_DOLLARS_PER_PAGE`, `CREDITS_VALID_DAYS`, `FREE_PLAN_INITIAL_CREDITS`, `MOESIF_APPLICATION_ID`, `TOKEN_PRICING_TABLE_JSON`), billing tables/columns, admin billing/credits/subscriptions/usage-stats pages + oRPC routers + hooks + analytics, webui type fields.

### Recommendation: where the simple concurrent-job cap lives
**Put the cap in the API's job-admission service, configured by a single env key.**

- **Config:** new key `MAX_CONCURRENT_JOBS` (int, default `4`; `0`/`-1` = unlimited) added to `shared/core/config/job.py` (`JobConfig`) — not to billing config, which is deleted. Document it in `core/apps/api/.env.example`, `core/apps/worker/.env.example`, `admin/.env.example`, `deploy/.env.defaults`.
- **Service:** `JobAdmissionCapacityService.enforce_job_creation_capacity` (renamed e.g. `enforce_job_capacity`), reading `settings.MAX_CONCURRENT_JOBS`, counting non-terminal jobs with the existing `_count_non_terminal_jobs` query. Drop the per-user `UserBalance` row lock (table is gone) and the tier/rpm/daily-quota branches.
- **Scope question (per-key vs global):** recommend a single **global** cap by default (simple, matches Q4; protects the worker regardless of account count). A per-user variant is a one-line change later (`WHERE user_id = :uid`) if operations wants it — decide in implementation, not in this ticket.
- **Dependency wiring:** `api/dependencies/job_admission.py` gains `require_job_capacity` (replacing `require_billing_limits`) used by `POST /v1/jobs` and `POST /v2/jobs`. The route system-limit dependency stays as the coarse per-endpoint throttle.
- **Why here:** it is already the choke point for job creation, it owns the active-job count, and it already raises `RateLimitException` with `CONCURRENT_LIMIT_EXCEEDED` + retry-after semantics — no new machinery needed; only the tier indirection is removed.

---

## 5. Recommended deletion order (dependency-based, suites green at each step)

> Guardrails: core pytest suite (contract/unit/migrations), admin Vitest (approx. 108 tests), webui Vitest (approx. 619 tests). Integration/contract tests that need `TEST_DATABASE_URL` are expected to **skip** without it — use that to land schema steps first without a database. Do not run the suites in this ticket (implementation ticket's job); order is designed so each step's deletion set is internally consistent.

1. **Schema/migrations (clean start):** define the new baseline without `credits_transactions`, `payment_records`, `stripe_price_configs`, `user_balances`, `tier_limits`, `guest_devices`, `jobs.credits_charged`, `jobs.billing_status` (keep `jobs.page_count`, `system_limits` incl. `period`). Retire `33eff537939b`, `b2c3d4e5f6a7`. Update `tests/migrations/test_schema_contract.py` + `tests/support/contract_database.py` (api) in the same step.
2. **Shared library:** delete `core/billing`, `config/billing.py` (after moving `S3_RESULTS_BUCKET`/`FRONTEND_URL`), `services/billing/*`, `repositories/credits*`, billing/guest/tier/balance models + exports, `schemas/billing.py`/`guest.py`/`dashboard.py`, `token_costing.py` + `TOKEN_PRICING_TABLE_JSON`, error-code/exception cleanups, telemetry billing fields, `zip_manifest_schema.py` billing fields, `contract_runtime.py` cleanup. Core pytest (unit-level, no DB) stays green.
3. **Core API (delete tier/guest/billing):** remove routes `billing.py`/`guest.py` + `api_v1.py` wiring, services `billing/*` + `guest/*` + `tier_service.py`, repos (payment/stripe/guest), scripts (`add_credits.py`, credits parts of `init_user.py`), and the rate-limit edits (data structures, rule loader, limiter, route policy, capacity service, dependencies). Replace `require_billing_limits` with `require_job_capacity` using `MAX_CONCURRENT_JOBS` (§4). Update api contract/unit tests + job-column cleanups in `result_projection.py`/`source_materializer.py`. Core contract tests with `TEST_DATABASE_URL` run green.
4. **Worker:** delete `processing_billing.py`, de-wire `processing_run.py`, strip refunds from `jobs/lifecycle/{failure_finalizer,service}.py`, re-scope `page_estimator.py` docs, drop billing metadata keys, clean `celery_router.py` dead `UserLevel` code. Update worker contract tests/support. Worker + core suites green (page-count telemetry unchanged).
5. **Admin:** delete billing page dir + usage buy-credits page, oRPC routers + external-api clients + wiring, `use-credits`, `lib/billing.ts`, payment-redirect/checkout analytics + provider/hook, `BILLING_ENABLED` env/config plumbing, shell/header/dashboard-client billing props, usage-page cost/credits UI + hooks, i18n keys, utils `formatCredits`; update/delete affected admin tests. Admin 108 green (job/API-key/usage-console features intact).
6. **WebUI:** remove `creditsSpent`, `billingStatus`/`ProcessingCost` types and `userTierLabel` prop (+ its test impact if any). WebUI 619 green.
7. **Contracts/SDK/telemetry tests + env/deploy hygiene:** final sweep — `test_self_hosted_telemetry_contract.py`, SDK-type mirrors anywhere else, `.env.example` files, `deploy/.env.defaults` (add `MAX_CONCURRENT_JOBS`), and a repo-wide grep for `credits_charged|billing_status|user_balance|tier_limits|guest_devices|BILLING_ENABLED|STRIPE` to confirm zero residue (excluding the excluded trees).

---

### Quick reference — keep vs delete at a glance

| Layer | Delete | Keep (engine) |
|---|---|---|
| API | `/v1/billing/*`, `/v1/guest`, Stripe/credits/tier/guest services, tier-aware rate-limit layers, billing repos/scripts | `/v1/*` jobs/documents/retrieval/demo/webhooks, system limits, job-capacity counting, auth/API keys |
| Shared | `core/billing`, `config/billing`, `services/billing`, `repositories/credits*`, billing/guest/tier/balance models+schemas, billing error codes, `token_costing`, telemetry billing fields | `system_limits`, `RateLimitConfig`/system-rule machinery, token-usage tracking, quota/token pools (provider/model budgets), job lifecycle, webhook outbox |
| Worker | `processing_billing.py`, billing hooks in `processing_run.py`, refund path in lifecycle, `UserLevel` vestige in `celery_router.py` | `page_estimator` (page counts to oversized-PDF policy + telemetry), ingestion pipeline, document agent/parser engines |
| Admin | billing page, buy-credits, credits/subscriptions/usage-stats routers+clients+hooks, checkout analytics, `BILLING_ENABLED` plumbing, credits/cost UI in usage console, pricing marketing copy | jobs/document monitoring console, API keys, settings, webhooks, usage-welcome provisioning, newsletter (Drizzle untouched) |
| WebUI | `creditsSpent`, `billingStatus`/`ProcessingCost` types, `userTierLabel` prop | everything else (no billing logic found) |
