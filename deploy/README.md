# Ziru Self-Hosted

English | [中文](README.zh-CN.md)

Ziru Self-Hosted packages Ziru for self-hosted deployments with Docker
Compose: the Ziru API, worker, admin console, and web UI in one stack.

## Requirements

- Docker and Docker Compose.
- A self-hosted MinerU instance reachable from the containers. MinerU is always local and uses the synchronous `/file_parse` endpoint; no API key is required.
- An LLM provider key/URL for any OpenAI-compatible endpoint (e.g. local Ollama or vLLM).

Ziru uses MinerU as the default PDF parser. If you customize the parsing pipeline, your own parser can also work as long as it produces Markdown (`.md`) files for Ziru to process. If you'd like to contribute support for additional PDF parsers, feel free to submit a pull request.

## 1. Prepare Services

- MinerU: run a self-hosted MinerU instance and point `MINERU_URL` at its base URL (default `http://host.docker.internal:8000`). MinerU is always local via `/file_parse` and does not use an API key.
- Any OpenAI-compatible model endpoint (local [Ollama](https://ollama.com/), [vLLM](https://docs.vllm.ai/), or a cloud provider)

## 2. Configure `.env`

Create a new `.env` file with only the values you need.

For a local OpenAI-compatible model server such as Ollama:

```bash
MINERU_URL=http://host.docker.internal:8000
PROVIDER_URL=http://localhost:11434/v1
PROVIDER_KEY=ollama
NORMAL_MODEL=qwen3:32b
HIERARCHY_LLM_MODEL=qwen3:32b
IMAGE_MODEL=llava:latest
IMAGE_MODEL_MAX=llava:latest
```

For self-hosted vLLM:

```bash
MINERU_URL=http://host.docker.internal:8000
PROVIDER_URL=http://localhost:8000/v1
PROVIDER_KEY=EMPTY
NORMAL_MODEL=Qwen/Qwen3-32B
HIERARCHY_LLM_MODEL=Qwen/Qwen3-32B
IMAGE_MODEL=Qwen/Qwen3-VL-32B-Instruct
IMAGE_MODEL_MAX=Qwen/Qwen3-VL-32B-Instruct
```

MinerU is always local (on-premise) and is called through `/file_parse`; it does not require an API key. Point `MINERU_URL` at your self-hosted MinerU base URL.

The active LLM provider is configured with `PROVIDER_URL` and `PROVIDER_KEY`. Per-role model names (`NORMAL_MODEL`, `HIERARCHY_LLM_MODEL`, `IMAGE_MODEL`, `IMAGE_MODEL_MAX`) must be set explicitly for the roles you enable.

For local access, no other settings are required. Host ports bind to `127.0.0.1` by default.

For external access through a local reverse proxy, keep the default binds and set `ADMIN_PUBLIC_URL` to the exact URL users open in their browser:

```bash
ADMIN_PUBLIC_URL=https://ziru.example.com
```

If `ADMIN_PUBLIC_URL` does not match the browser URL, login or signup may fail.
`WEBUI_PUBLIC_URL` serves the same purpose for the WebUI (used for storage CORS).

If users need to connect directly to the host ports from another machine, also expose only the required public services:

```bash
ADMIN_HOST_BIND=0.0.0.0
WEBUI_HOST_BIND=0.0.0.0
API_HOST_BIND=0.0.0.0
```

Self-hosted deployments send anonymous product telemetry by default
(`TELEMETRY_ENABLED=true`). It uses a random installation id and aggregate
metrics only — not prompts, filenames, user identity, or request bodies. To opt
out, set `TELEMETRY_ENABLED=false`. See
[Anonymous product telemetry](docs/configuration.md#anonymous-product-telemetry)
for the event catalog, privacy bounds, and property tables.

## 3. Start Ziru

```bash
docker compose up -d
```

Access the services:

| Service | URL |
| --- | --- |
| Admin console | http://localhost:81/login |
| Web UI | http://localhost:80 |
| API health check | http://localhost:5005/health |

The defaults are configurable via `ADMIN_HOST_PORT`, `WEBUI_HOST_PORT`, and
`API_HOST_PORT` in `.env`. Port 80 needs elevated privileges on Linux — set
`WEBUI_HOST_PORT` to a high port (for example 8080) if you cannot bind it.
During development the dev servers keep their own ports: admin console on
3000, WebUI on 3001.

The `webui` compose service is a first wiring: the WebUI is **not yet
staged into the deploy image** (`deploy/Dockerfile` builds the API, worker,
and admin console only). Compose builds the webui service from `../webui`
(`webui/Dockerfile`) for now; once a `ziru-webui` image is published, set
`WEBUI_IMAGE` in `.env` and the service uses that image instead. The
service proxies `/api/*` to the core API (`NEXT_PUBLIC_API_URL=http://app:5005/api`);
its build/publish and env wiring in deploy is not yet complete.

## API Usage

The API is REST/JSON and self-documents at `/docs` (OpenAPI). Language SDKs
for the Ziru API will be published separately.

### Input Format Recommendation

**Convert Office files to PDF before uploading.** Ziru parses PDFs with MinerU, which produces
the most complete and structured result (full markdown, table cell structure, footers, and
footnotes). Word documents (`.docx`) are parsed by a separate, simpler pipeline that:

- flattens tables into plain text, losing the row-to-column value mapping;
- drops page footers and footer-note legends;
- does not emit a `full.md` artifact.

The MinerU office backend in current releases is not reliable for real-world `.docx` files either.
Empirical testing on government funding-application forms found that submitting `.docx` directly to
MinerU returned an empty markdown (only a page-number header survived), and figures like the "Net
Additional Recurrent Expenditure" row were occasionally lost when PDFs were generated by third-party
converters. The original `.docx` never loses a figure, but without table structure it is hard to
attribute values to columns.

**Recommended workflow for accurate cost/savings analysis:**

1. Convert the source `.docx` to PDF with your office suite (e.g. LibreOffice, Microsoft Word,
   or Adobe Acrobat) before uploading.
2. Upload the **PDF** to Ziru.
3. Keep the original `.docx` as a second reference — if a figure looks suspicious, cross-check it
   against the source document. Do not rely on a single conversion's output for totals rows.

This gives you MinerU's full structural output while keeping the original file's fidelity.

## Common Commands

Check service status:

```bash
docker compose ps
```

View application logs:

```bash
docker compose logs -f app
```

Stop the stack:

```bash
docker compose down
```

Update images and restart:

```bash
docker compose pull
docker compose up -d
```

Database data and uploaded files remain in Docker volumes after `docker compose down`.

## More Configuration

There are more configurations like model choices, storage, webhooks, database, and Redis settings are documented in [docs/configuration.md](docs/configuration.md).

## Acknowledgements

Ziru Self-Hosted is part of Ziru, a fork of
[Knowhere](https://github.com/Ontos-AI/knowhere) by Ontos-AI, distributed
under the Apache License 2.0. See the root [NOTICE](../NOTICE) for the
upstream attribution notices.
