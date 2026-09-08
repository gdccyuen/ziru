# Research: OCR / VLM Models on the Ziru Local Document-Parsing Stack

Status: verified locally (files/process/API inspection) + external model facts (web). Research only — no configs or services were modified.

## 1. Unsloth Studio model/endpoint availability (what is actually served right now)

**OpenAI-compatible endpoint:** `http://127.0.0.1:8888/v1` (Unsloth Studio backend, PID 78263, python3.1, `~/.unsloth/studio/unsloth_studio`).

`GET /v1/models` (key from `deploy/.env` `PROVIDER_KEY`) returns exactly three models:

| id | quant | loaded |
|---|---|---|
| `gpustack/bge-m3-GGUF` | bge-m3-FP16 | **true** |
| `gpustack/bge-reranker-v2-m3-GGUF` | FP16 | false |
| `unsloth/Qwen3.8-27B-GGUF` | UD-Q4_K_XL | false |

The loaded model is an **embedding** model. The Unsloth Studio backend spawned one `llama-server` child on **`:63945`**:

- `/Users/gordon/.unsloth/studio/run/children/78263.json` → child PID 70733
- `/Users/gordon/.unsloth/studio/llama-server.pid` → `70733:1788703009.242341`
- `:63945/props` shows `model_alias: gpustack/bge-m3-GGUF`, `vision:false`, model path `/Users/gordon/.cache/huggingface/hub/models--gpustack--bge-m3-GGUF/snapshots/2d48f1737679ad900d5c26c5aad5410e9c70fdca/bge-m3-FP16.gguf`.

So the **only** currently-served model via an OpenAI-compatible endpoint is the bge-m3 embedding model. `Qwen3.8-27B` is registered and was previously loadable with an `mmproj` vision projector (see `~/.unsloth/studio/tauri.log`: `Detected mmproj for vision …`), but it is **unloaded** now.

### PaddleOCR-VL / MinerU2.5 are NOT served by Unsloth Studio

Neither `mlx-community/PaddleOCR-VL-1.5-bf16` nor `opendatalab/MinerU2.5-2509-1.2B` appears in `/v1/models`, nor in Unsloth Studio's hub-state manifests (`~/.unsloth/studio/cache/hub-state/manifests/` — only bge-m3, bge-reranker, Qwen3.8). The user's belief is **outdated** for the running instance.

However, both model files **exist on disk** in the Hugging Face cache:

- `/Users/gordon/.cache/huggingface/hub/models--mlx-community--PaddleOCR-VL-1.5-bf16` — **1.7 GB**; `config.json` architecture `PaddleOCRVLForConditionalGeneration`, hidden_size 1024, 18 layers, `model_type: paddleocr_vl`, `model.safetensors` ≈ 1.81 GB.
- `/Users/gordon/.cache/huggingface/hub/models--opendatalab--MinerU2.5-2509-1.2B` — **2.2 GB**; `config.json` architecture `Qwen2VLForConditionalGeneration`, hidden_size 896, 24 layers, `model_type: qwen2_vl`, `model.safetensors` ≈ 2.31 GB.

There is **no** second model server listening for them. Verified listening TCP ports (via `lsof -nP -iTCP -sTCP:LISTEN`): `:8888` (Unsloth Studio), `:63945` (llama-server), `:8000` (MinerU), `:5005` (deploy-api), `:80`/`:81` (ziru webui/admin), `:6379`, `:5432`, `:3080`, `:7000`, `:5000`. **No `:8989` (mlx_vlm) and no `:30000` (mineru-openai-server).**

Additional PaddleOCR-VL cache: `/Users/gordon/.paddlex/official_models/PaddleOCR-VL-1.5/` (≈1.8 GB `model.safetensors`) — downloaded by PaddleX, not by Unsloth Studio. `/Users/gordon/.paddlex/official_models/PP-DocLayoutV3/` is also present.

## 2. What the two models are and how they plug in

### `opendatalab/MinerU2.5-2509-1.2B`

- A **Qwen2-VL based vision-language model** (1.2B) built specifically for **high-resolution document parsing** (image → structured Markdown/JSON). See [MinerU2.5 arXiv paper (2509.22186)](https://ar5iv.labs.arxiv.org/html/2509.22186) and [MinerU 3 docs](https://github.com/opendatalab/MinerU).
- It is **MinerU's own VLM backend model**. MinerU 3.x uses it for the `vlm`/`hybrid` backends (`vlm-engine`, `hybrid-engine`, and the `*-http-client` variants). In this codebase:
  - `mineru/utils/enum_class.py` → `ModelPath.vlm_root_hf = "opendatalab/MinerU2.5-Pro-2605-1.2B"` (default), `ModelPath.vlm_root_modelscope = "OpenDataLab/MinerU2.5-Pro-2605-1.2B"`.
  - `~/mineru.json` (the actual config) overrides `models-dir.vlm = /Users/gordon/.cache/huggingface/hub/models--opendatalab--MinerU2.5-2509-1.2B/snapshots/879e58bdd9566632b27a8a81f0e2961873311f67`, so the **2509** checkpoint is the local VLM used here.
- MinerU loads it as a VLM through `mineru/backend/vlm/vlm_analyze.py`. On macOS it auto-selects **`mlx-engine`** (`engine_utils.py` → `_select_mac_engine()` returns `mlx` when `mlx_vlm` is importable). The MinerU `.venv` (repos/MinerU) has `mlx`, `mlx_vlm`, `torch 2.13.0` with `MPS` available, and **no `vllm`**. So the local `vlm-engine` path runs **MinerU2.5-2509 via MLX on Apple Silicon**, using the already-cached model.
- It can also be used remotely via `vlm-http-client` / `hybrid-http-client`, pointing `server_url` at any OpenAI-compatible server that speaks MinerU's VLM request/response format.

### `PaddleOCR-VL` (v1.5, 0.9B)

- A **PaddleOCR + VLM hybrid** document-understanding model (0.9B, 128K ctx). See [PaddleOCR-VL-1.5 blog](https://ernie.baidu.com/blog/posts/paddleocr-vl-1.5/), [PaddleOCR-VL-1.5 vLLM recipe](https://recipes.vllm.ai/PaddlePaddle/PaddleOCR-VL-1.5), [MLX community bf16](https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-bf16), and the [PaddleOCR Apple Silicon doc](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/acfd89b12602ba9009eb6620a8a9353c6d71bef0/docs/version3.x/pipeline_usage/PaddleOCR-VL-Apple-Silicon.md).
- It is **not** a MinerU backend. It is a **separate OCR/document pipeline** inside PaddleOCR / PaddleX (PP-StructureV3). In `/Users/gordon/Documents/repos/paddleOCR-VL-1.5/`:
  - `ocr1.py` uses `PaddleOCRVL(pipeline_version="v1.5", vl_rec_backend="mlx-vlm-server", vl_rec_server_url="http://localhost:8989", vl_rec_api_model_name="PaddlePaddle/PaddleOCR-VL-1.5", …)`.
  - `mlx.sh` is just `mlx_vlm.server --port 8989`.
  - So the intended local usage is: run an **MLX VLM server on `:8989`**, then let PaddleOCR-VL use it as its recognition backend. That server is **not running**.
- MinerU does **not** support plugging PaddleOCR-VL in as its OCR engine. MinerU's `pipeline` backend uses `opendatalab/PDF-Extract-Kit-1.0` (PP-DocLayoutV3 + unimernet/formulanet + PytorchPaddleOCR + slanet/unet) and its `vlm`/`hybrid` backends use MinerU2.5. PaddleOCR-VL is a separate code path with a different output contract.

## 3. How the local MinerU is launched/configured

- Running service: **`http://127.0.0.1:8000`**, health reports `version 3.4.5`, `protocol_version 2`, `max_concurrent_requests 1`.
- Process: Python PID **27228**, cwd **`/Users/gordon/Documents/repos/MinerU`**, using **`.venv`** (`~/.venv/lib/python3.12/site-packages`) with editable install `mineru-3.4.5`.
- Launch per `repos/MinerU/steps-to-API.md`: `mineru-api --host 0.0.0.0 --port 8000` (venv + `pip install -e ".[all]"`), i.e. **host process, not Docker** (the Docker `compose.yaml` requires NVIDIA GPU and fails on macOS).
- Config: **`~/mineru.json`** (`config_version 1.3.2`):
  - `models-dir.pipeline`: `/Users/gordon/.cache/huggingface/hub/models--opendatalab--PDF-Extract-Kit-1.0/snapshots/ed6b654c018d742e65a17671e379c5e6ecc87ec9`
  - `models-dir.vlm`: `/Users/gordon/.cache/huggingface/hub/models--opendatalab--MinerU2.5-2509-1.2B/snapshots/879e58bdd9566632b27a8a81f0e2961873311f67`
  - `model-source`: `huggingface`
- Backend enum (`mineru/cli/api_request.py`, `backend_options.py`): `pipeline`, `vlm-engine`, `hybrid-engine`, `vlm-http-client`, `hybrid-http-client`; **default is `hybrid-engine`**. Ziru explicitly sends `backend=pipeline` (see below).
- **Does it currently use a local VLM?** No. Ziru calls `/file_parse` with `backend=pipeline`, so the running service uses the deterministic `pipeline` backend (PDF-Extract-Kit native models). The VLM path is configured but not in use.
- **VLM via MLX is reachable if you flip the backend**: `vlm-engine` on macOS auto-resolves to `mlx-engine`, which loads the cached `MinerU2.5-2509-1.2B`.
- **`*-http-client` is currently blocked**: MinerU binds `0.0.0.0`; `public_http_client_policy` disables `*-http-client` and `server_url` when publicly bound unless the service is started with `--allow-public-http-client` (or `MINERU_API_ALLOW_PUBLIC_HTTP_CLIENT=1`). `steps-to-API.md` shows the service started **without** that flag.

## 4. Ziru's integration points

- `deploy/.env`: `MINERU_URL=http://127.0.0.1:8000`, `PROVIDER_URL=http://127.0.0.1:8888/v1`, `IMAGE_MODEL=unsloth/Qwen3.8-27B-GGUF` (the VLM Ziru already uses for image analysis).
- `deploy/compose.yaml` worker: `MINERU_URL: http://host.docker.internal:8000`.
- `core/packages/shared-python/shared/core/config/mineru.py`: `MINERU_LOCAL_BACKEND` default **`pipeline`**; `MINERU_LOCAL_LANG_LIST` default **`ch`**; `MINERU_LOCAL_TIMEOUT` 3600.
- `core/apps/worker/app/services/document_parser/providers/mineru/pdf_service.py` (`parse_via_local`) posts to `/file_parse` with form fields: `lang_list`, `backend`, `return_images`, `response_format_zip`, `return_original_file`. **It does NOT pass `server_url`**, so the only local-MinerU backends usable today are the local engines (`pipeline`, and — if the model/MLX path works — `vlm-engine` / `hybrid-engine`), not the `*-http-client` family.
- Pipeline model path oddity: `~/mineru.json`'s `models-dir.pipeline` points to a `PDF-Extract-Kit-1.0` snapshot that is **not present** in the HF cache (only a `/.locks/models--opendatalab--PDF-Extract-Kit-1.0` lock dir exists). Pipeline parses still succeeded (21 completed tasks, e.g. `output/…/auto/*.md`), so pipeline weights live elsewhere/are restored — do not change this config without confirming where they are.

## 5. Would adopting MinerU2.5 / PaddleOCR-VL benefit the local MinerU?

| | MinerU2.5 via `vlm-engine` | PaddleOCR-VL as MinerU OCR |
|---|---|---|
| Quality (scan/atlas/tables/handwriting) | Higher on English/Chinese scans & layout (VLM end-to-end) | Different pipeline; strong OCR but a separate output contract |
| Offline/deterministic | Fully offline, cached (2.3 GB); VLM output is less "hallucination-free" than `pipeline` but designed for doc parsing | Offline, cached (1.7 GB MLX + PaddleX copy); MLX server on `:8989` would need starting |
| Throughput on this Mac | Slower (MLX VLM, single-concurrency `max_concurrent_requests=1`); okay for small scan-heavy sets, not batch | Similar MLX VLM cost; plus a separate local server |
| Integration effort/risk | **Low** — flip `MINERU_LOCAL_BACKEND=vlm-engine`; no code change; MinerU uses the cached 2509 model | **High** — separate `mlx_vlm.server` + PaddleOCR-VL pipeline; Ziru would need a new service/contract (different from `full.md` + `images/`) |
| Compatible with current `backend=pipeline` deterministic mode | No — it replaces `pipeline` for those docs (ch/en only) | No — it's a different pipeline entirely |

### Recommendation

1. **Keep `backend=pipeline` as the default** for normal/clean text PDFs and multilingual corpora (deterministic, CPU, already the eval baseline — see `docs/research/modulised/docs/samples/SecDocs/eval/queries.yaml` header: "Generated from MinerU output (localhost:8000, backend=pipeline)").
2. **Adopt `MinERU2.5-2509-1.2B` for scan-heavy / atlas-mode English (or Chinese) PDFs** by switching **per-document** to `vlm-engine`. Since this Mac auto-selects `mlx-engine`, no new server or `server_url` is needed. Configuration change (Ziru): set `MINERU_LOCAL_BACKEND=vlm-engine` (or add a per-document backend selector in the worker) and keep `lang_list=ch`/`en`. This uses the already-cached `~/mineru.json` `models-dir.vlm`. Risk: slower, ch/en only, single-concurrency (Ziru already has `MINERU_LOCAL_TIMEOUT=3600` and queue-wait awareness).
3. **Do not wire PaddleOCR-VL into MinerU.** It is a separate PaddleOCR/PaddleX pipeline. If you need a dedicated ultra-OCR path for pure scanned images, run `mlx_vlm.server --port 8989` + PaddleOCR-VL-1.5 as its own service and expose a distinct endpoint/contract; it would not reuse MinerU's `full.md`/`images/` ZIP layout, so Ziru's `_flatten_extracted_zip` would need a new adapter.
4. **Do not use `vlm-http-client` / `hybrid-http-client`** unless you also (a) restart the `:8000` API with `--allow-public-http-client` and (b) add `server_url` to Ziru's `parse_via_local` form fields — and then only if the OpenAI server actually speaks MinerU's VLM protocol (a generic VLM like Qwen3.8 or PaddleOCR-VL will **not** match MinerUClient's expected extraction responses).

## External sources (untrusted data, facts only)

- [MinerU2.5: Decoupled VLM for Document Parsing (arXiv 2509.22186)](https://ar5iv.labs.arxiv.org/html/2509.22186)
- [PaddleOCR-VL-1.5 blog (Baidu ERNIE)](https://ernie.baidu.com/blog/posts/paddleocr-vl-1.5/)
- [PaddleOCR-VL-1.5 vLLM recipe](https://recipes.vllm.ai/PaddlePaddle/PaddleOCR-VL-1.5)
- [mlx-community/PaddleOCR-VL-1.5-bf16 (HF)](https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-bf16)
- [PaddleOCR-VL Apple Silicon / MLX doc](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/acfd89b12602ba9009eb6620a8a9353c6d71bef0/docs/version3.x/pipeline_usage/PaddleOCR-VL-Apple-Silicon.md)
