# P0 — Baseline (2026-08-19)

Branch: `overhaul` (created from main @ 9ec7938). Live demo stack stays on `main` until P7 cutover.

## Infra status (all healthy)
- deploy-postgres-1, deploy-redis-1, deploy-localstack-1 — up, healthy.

## Baseline test counts

| Suite | Result | Notes |
|---|---|---|
| core API (pytest) | **229 passed, 2 failed** | see failures below |
| core worker (pytest) | **176 passed, 2 failed** | see failures below |
| admin (vitest) | ✅ pass (≈108) | exit 0 |
| admin (type-check) | ✅ | exit 0 |
| admin (lint) | ❌ 2 pre-existing issues | both in marketing/landing files (`versus/[product]/page.tsx` unused var, `_(landing)/footer.tsx` unused import) — deleted in P5 |
| webui (vitest) | ✅ pass (619) | exit 0 |
| webui (typecheck) | ✅ | exit 0 |
| webui (lint) | ✅ | exit 0 |

## Core failures (baseline, pre-overhaul)

1. `tests/contract/test_job_creation_contract.py::test_v2_created_page_memory_job_can_query_v2_retrieval` — integration-style contract test; needs DB/Redis infra (env-gated). Verify against TEST_DATABASE_URL before P3.
2. `tests/contract/test_self_hosted_telemetry_contract.py::test_self_hosted_telemetry_defaults_to_enabled` — test expects telemetry default-enabled; code defaults disabled. Stale test — **dies with D4 telemetry removal in P1**.
3. `tests/unit/test_summary_builder.py::TestLlmTrigger::test_long_contrib_calls_llm_with_title_for_empty_summary` and `test_single_child_with_self_only_does_not_copy_child` (worker) — pre-existing unit failures (LLM is monkeypatched, so not key-related); expectations look stale vs current engine behavior (`content_snippets` vs `summary`). Triage at P1 start; engine algorithm itself stays frozen (Q5).

## Environment fixes (machine-level, NOT committed — venv is gitignored)

1. **Stale knowhere_shared editable install removed** from `core/.venv` — the venv carried BOTH `knowhere_shared` and `ziru_shared` editable installs; the old one shadowed the new and the test suite silently ran against the OLD repo clone (/Users/gordon/Documents/repos/knowhere).
2. **44 stale console-script shebangs rewritten** in `core/.venv/bin` (pytest, uvicorn, celery, alembic, …) — they pointed at the old clone's python. Symptom: `uv run pytest` failed with ImportErrors from knowhere paths while `uv run python -m pytest` passed.
3. **uv cache:** the sandbox blocks `~/.cache/uv` — always run uv with `UV_CACHE_DIR=/Users/gordon/Documents/repos/ziru/core/.uv-cache` (the Makefile already does this via its UV_CACHE_DIR logic).

## Guardrail commands (verified)

- core: `cd core/apps/api && UV_CACHE_DIR=… uv run pytest -q` (same for worker)
- admin: `pnpm test` / `pnpm type-check` / `pnpm lint` (lint red only on P5-deleted marketing files)
- webui: `pnpm test` / `pnpm typecheck` / `pnpm lint` — all green

## Open input from PM
- D3 feel-test glitch list — still not collected; log it whenever (fixes happen at P7).
