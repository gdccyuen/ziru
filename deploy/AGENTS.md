# AGENTS.md

## What this repo is (and is not)

This repo **only packages** Ziru for self-hosted Docker Compose deployment. It contains **no application code**. The API, worker, and admin console source live in this monorepo's `core/` and `admin/` (the WebUI lives in `webui/` and is built separately — see the webui compose service note below) and are staged in at build time:

- `core/` — Python API + Celery worker (`apps/api`, `apps/worker`, `packages/shared-python`)
- `admin/` — Next.js admin console

Do not look for or edit app logic here. Changes to API/worker/admin console behavior must be made in `core/` or `admin/`; WebUI changes go in `webui/`. This repo's surface is: `Dockerfile`, `compose.yaml`, `.env.defaults`, `scripts/`, `docs/`, `.github/workflows/`.

## Verification

There is **no test, lint, typecheck, or format toolchain** in this repo — do not assume `npm test`, `pytest`, `ruff`, etc. exist. The only verification is the smoke test:

```bash
./scripts/smoke-test.sh
```

It brings up the full stack under `COMPOSE_PROJECT_NAME=ziru-self-hosted-smoke` on shifted ports (admin console `13000`, API `15005`, postgres `15432`, redis `16379`, localstack `14566`) and polls `/login` + `/health` for up to 90×2s.

For shell/Python script edits, sanity-check with `bash -n scripts/*.sh` and `python3 -m py_compile scripts/*.py`.

## Local image build

The Dockerfile copies from `.build/sources/{core,admin}/`, which is gitignored and staged by:

```bash
./scripts/prepare-sources.sh
```

By default it expects sibling checkouts at `../core` and `../admin` (archive of `HEAD`). Override with `ZIRU_API_SOURCE` / `ZIRU_API_REF` / `ZIRU_ADMIN_SOURCE` / `ZIRU_ADMIN_REF`. Then `docker build .`.

## Image publishing

Currently **disabled** (`.github/workflows/publish-image.yml.disabled`): it pushed to the upstream registries (`ghcr.io/ontos-ai/knowhere`, Aliyun ACR) and must be rewritten to publish Ziru images (`ghcr.io/gdccyuen/ziru`) before re-enabling.

## Environment configuration

`compose.yaml` loads `.env.defaults` (committed, **do not put secrets here**) then `.env` (operator overrides, gitignored) via `env_file`. The README tells operators to create a small `.env` with only overrides.

Runtime defaults are layered further by `scripts/entrypoint.sh` via `setDefault` and several values are **derived** (e.g. `API_DATABASE_URL` from `POSTGRES_*`, `NEXT_PUBLIC_APP_URL` from `ADMIN_PUBLIC_URL`, `CELERY_REDIS_URL` from `REDIS_*`). When changing a default, check both `.env.defaults` and `entrypoint.sh` — the entrypoint can override what's in the file. Full variable reference: `docs/configuration.md`. The legacy `DASHBOARD_*` env names still work for one release via a deprecation shim in `entrypoint.sh` (and the other scripts).

Auto-generated secrets (`SECRET_KEY`, `BETTER_AUTH_SECRET`, `USERS_VERIFY_*`, `USERS_RESET_PASSWORD_*`) are persisted in the `ziru_secrets` volume at `/data/secrets/`; deleting that volume regenerates them.

## Single-container runtime

The image runs **three processes** in one container via `scripts/entrypoint.sh` (supervised by `tini`), in this order:

1. wait for postgres → ensure extensions (`uuid-ossp`, `pg_trgm`)
2. wait for redis
3. create S3 buckets (`scripts/create-storage-buckets.py`)
4. run admin drizzle migrations
5. start API (`apps/api/main.py`, port 5005) → wait for `/health`
6. configure S3 event notifications + SNS subscription (`scripts/configure-storage-events.py`) — runs after API so the webhook target is up
7. start worker (`apps/worker/worker.py`)
8. start admin console (`next start`, container port 3000)

Container exits if any of the three processes exits. Healthcheck hits both `:3000/login` and `:5005/health` (container-internal ports; host mappings default to admin console `81`, WebUI `80` — elevated privileges needed on Linux for 80 — and API `5005`).

Two separate venvs are built in the image: `/opt/ziru/venvs/api` and `/opt/ziru/venvs/worker`. Both install from the upstream `uv.lock` with `uv sync --locked --no-dev`.

## Compose services

`app` (the combined image), `webui` (built from `../webui` — not yet staged into the deploy image or the publish pipeline; see README), `postgres:15-alpine`, `redis:7-alpine`, `localstack:3.8` (S3/SNS/SQS/IAM/STS with persistence). All host ports bind `127.0.0.1` by default; set `*_HOST_BIND=0.0.0.0` to expose. Named volumes persist data across `docker compose down`. Dev servers stay on 3000 (admin) / 3001 (webui).

LocalStack is reachable at `localhost.localstack.cloud:4566` (network alias) for S3 operations; `S3_ENDPOINT_URL` defaults to that host so presigned URLs work from inside the container.

## Telemetry

Anonymous telemetry is **off by default** in the Ziru fork (`TELEMETRY_ENABLED=false`). Opt in by setting `TELEMETRY_ENABLED=true`. Event schema and privacy bounds are documented in `docs/configuration.md` → "Anonymous product telemetry".

## Conventions

- Keep `.env.defaults` and `docs/configuration.md` in sync when adding/removing/renaming env vars — the docs are the operator-facing reference and the file is the executable default.
- `README.md` and `README.zh-CN.md` (plus `docs/configuration.md` / `docs/configuration.zh-CN.md`) are maintained in parallel; update both languages for user-facing changes.
- Branch naming seen in history: `feat/`, `fix/`, `chore/`, `docs/`, `ci/` with `<author>/<topic>`. PRs merge into `main`.
- The default image (`ZIRU_IMAGE=ghcr.io/gdccyuen/ziru:latest`) and an Aliyun mirror are both supported; mention both when touching image references.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` at repo root, `docs/adr/` for architectural decisions). See `docs/agents/domain.md`.
