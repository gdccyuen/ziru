# Ziru Tester Guide

Goal: verify the Ziru knowledge engine (containerized, on-premise) works end to end.
Time: ~45–60 min. All commands run in a Terminal on the host Mac.

## 0. Prerequisites

- OrbStack is running (`docker info` shows the server)
- Local parsing/LLM services (already configured in `deploy/.env`):
  - **Local MinerU** on http://127.0.0.1:8000 (synchronous `/file_parse`; no cloud endpoint, no API key). Health: `curl http://127.0.0.1:8000/health`
  - **Local Qwen** (OpenAI-compatible) on http://127.0.0.1:8888/v1 with a model loaded
- These are always local. If either is absent, tests marked *(needs MinerU/LLM)* fail on ingestion/chat — everything else still works.

## 1. Docker image

```bash
docker images | grep ziru
```

Expected: `ziru:local` exists (if not, build: `docker buildx build -t ziru:local -f deploy/Dockerfile .`).

## 2. Start the stack

```bash
cd deploy
docker compose up -d
docker compose ps
```

Expected: `api`, `admin`, `webui`, `worker` up; `postgres`, `redis` healthy. The application containers (`api`, `admin`, `webui`, `worker`) are configured with `restart: unless-stopped`.

## 3. Health checks

```bash
curl http://127.0.0.1:5005/health      # {"status":"healthy",...}
open http://localhost:81               # admin console (login page)
open http://localhost:80               # webui (login page)
```

## 4. Accounts

| Grade | Email | Notes |
|---|---|---|
| administrator | admin@ziru.local | password from ADMIN_BOOTSTRAP_PASSWORD (forced change on first login if fresh DB) |
| librarian / user | create below | |

1. Log in to :81 as admin → Users → **Create user**: librarian with profile `division: [product, engineering]`; and a plain user with profile `division: [product]`.
2. Attributes → verify the dictionary exists (division / doc-type / region / topic) or create entries.

## 5. Functional test matrix

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | **Upload (admin)** | Documents → Upload → pick a small PDF, set attributes, Upload | Job appears on Jobs; per-file status works |
| 2 | **Batch cap** | Upload dialog: pick 11 files | Only 10 queued; picker disabled; warning shown |
| 3 | **Job ETA** | Jobs page while job runs | Estimate column shows ~total/remaining |
| 4 | **Jobs auto-refresh** | Leave Jobs open 60s | List refreshes silently |
| 5 | *(needs MinerU/LLM)* **Ingestion completes** | Watch `docker compose logs -f worker` | Job → done; worker logs show only local MinerU `/file_parse` calls (no cloud/batch endpoints) |
| 6 | **Document visibility (admin)** | Documents page | All documents visible incl. createBy as email |
| 7 | **Profile scoping (user)** | Log in as the plain user on :80 → Documents | Only docs matching `division: product` |
| 8 | **Search** | Webui Search: query "wifi" | Results (hyphen normalization: wifi ≡ Wi-Fi) |
| 9 | **Chat answer** | Webui Chat: ask a question | User echo appears instantly; the assistant returns a synthesized plain-English answer with inline [Source N] markers. It may take up to a few minutes (local Qwen gets up to 3 attempts); only if all 3 return empty does it fall back to the retrieved evidence. Folded Retrieval stats + Sources appear below, and message timestamps render in the browser's local timezone |
| 10 | **Chunk pane** | Click a source / [Source N] | Pane opens in **Tree** mode with the selected document's real section tree, chunk-count badges, expandable sections, and chunk-leaf cards; clicking a leaf opens **Text** mode with full chunk content (fetched on demand when it is not already in the citation); Text/Tree toggle works |
| 11 | **Invisibility warning** | As librarian, upload dialog: set attributes not matching own profile | Amber warning shown before submit |
| 12 | **Edit attributes** | Admin console Documents → Edit on a row | Save works; built-ins read-only/unchanged |
| 13 | **Resilience** | `docker compose restart api`; wait; reload page | Auto-recovers (restart: unless-stopped) |
| 14 | *(optional)* **Archive** | Admin: Archive a doc | Disappears from active list |

## 6. Cleanup (optional)

```bash
cd deploy && docker compose down        # stops containers (volumes kept)
docker container prune -f               # remove stopped containers
```

## Notes / reporting

- Screenshot any failure with the browser console errors and the relevant log:
  `docker compose -f deploy/compose.yaml logs --tail=50 api|worker|webui`
- Known pre-existing: worker suite has 2 unrelated summary_builder failures (development only, not in this stack).
