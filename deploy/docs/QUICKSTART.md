# Ziru Quick Start

Run the whole knowledge engine locally with Docker (one image, MODE-dispatched services).

## Architecture

| Service | Image | Port (host) | Inside container |
|---|---|---|---|
| api | ziru:local (MODE=api) | 5005 | uvicorn :5005 |
| worker | ziru:local (MODE=worker) | — | celery worker |
| admin | ziru:local (MODE=admin) | 81 | next start :3001 |
| webui | ziru:local (MODE=webui) | 80 | next start :3000 |
| postgres | postgres:15 | 5432 | :5432 |
| redis | redis:7 | 6379 | :6379 |

LLM and MinerU run ON THE HOST (outside Docker): Unsloth Desktop (llama.cpp engine) on :8888 and mineru-api on :8000. Containers reach them via `host.docker.internal`.

## Prerequisites

- OrbStack (or Docker Desktop) running
- Local LLM: Unsloth Desktop with a model loaded at `http://127.0.0.1:8888/v1` (API key in `PROVIDER_KEY`)
- MinerU: `mineru-api` listening on `http://127.0.0.1:8000`
- IMPORTANT: both services must bind `0.0.0.0` (not just 127.0.0.1) so containers can reach them via `host.docker.internal`

## Quick Start

```bash
cd deploy

# 1. Configure environment
cp .env.example .env          # edit values (ports, DB, provider key, bootstrap admin)

# 2. Build the image (first time; ~5-15 min)
docker build -t ziru:local -f Dockerfile ..

# 3. Start the stack
docker compose up -d

# 4. Verify
curl http://127.0.0.1:5005/health          # {"status":"healthy",...}
open http://localhost:81                   # admin console (login: admin@ziru.local)
open http://localhost:80                   # webui
docker compose logs -f worker              # watch ingestion
```

On first boot the API migrates the schema automatically (entrypoint runs `alembic upgrade head`)
and creates the bootstrap admin when the users table is empty.

## Demo accounts (defaults)

| Grade | Email | Notes |
|---|---|---|
| administrator | `admin@ziru.local` | password from `ADMIN_BOOTSTRAP_PASSWORD`; forced change on first login |
| librarian | create in admin console | can upload + edit attributes |
| user | create in admin console | read-only |

## Usage flow

1. Admin console (:81) → Attributes: define the dictionary (e.g. division, region, doc-type)
2. Admin console → Users: create librarian/user accounts with profiles
3. Webui (:80) or console → upload documents (librarian/admin) with attributes
4. Search / chat in webui; profile-scoped access enforced server-side
5. Original files + fileHash are stored on every document (audit trail)

## Data & storage

- Postgres data: Docker volume `postgres_data`
- Uploaded originals + parse results: named volume `ziru_storage` (filesystem storage; `OBJECT_STORAGE_LOCAL_ROOT=/data/storage`)

## Dev mode (from source, no Docker)

```bash
# infra only
cd deploy && docker compose up -d postgres redis

# services from source (ports 3000/3001/5005)
cd core/apps/api && . ../../deploy/.env && uv run uvicorn main:app --port 5005
cd core/apps/worker && . ../../deploy/.env && uv run python worker.py
cd admin && npm run dev -- -p 3001
cd webui && npm run dev -- -p 3000
```

## Troubleshooting

- `Connection refused` from containers to :8888/:8000 → the host services are bound to
  127.0.0.1 only; rebind them to 0.0.0.0 (Unsloth settings / `mineru-api --host 0.0.0.0`).
- Login 500 → check `docker compose ps` (postgres/redis healthy) and `docker compose logs api`.
- "No model loaded" on :8888 → load the model in Unsloth Desktop / enable auto-switch.
