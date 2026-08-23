# Ziru LLM Guide — one page

Status: advisory reference (2026-08-22). The engine is frozen; this doc explains how LLM services are wired so operators can enable them deliberately.

## How LLM access works

All LLM calls go through one OpenAI-compatible transport and are gated by credentials:

- Config: `core/packages/shared-python/shared/core/config/ai.py` (`AIConfig`, env-driven)
- Transport: `core/packages/shared-python/shared/services/ai/openai_compatible_client_sync.py`
  (timeout 300s default, exponential-backoff retry on 429, usage accounting)
- Gate: `core/packages/shared-python/shared/services/retrieval/llm_adapter.py` —
  no key set → no LLM client → evidence-only mode (search/chat still work)

Providers (OpenAI-compatible, defaults shown — any compatible endpoint works, e.g. local vLLM/Ollama):
| Env var | Default |
|---|---|
| `DS_KEY` / `DS_URL` | `` / `https://api.deepseek.com/v1` |
| `GLM_API_KEY` / `GLM_URL` | `` / `https://open.bigmodel.cn/api/paas/v4` |
| `GPT_API_KEY` | `` (OpenAI) |

## Groups by purpose

| Group | Purpose | Model knob | Runs when |
|---|---|---|---|
| A. Retrieval reasoning | Agentic search: planning/decomposition, navigation, tool use, reranking | `RETRIEVAL_PLANNER_MODEL`, `NORMOL_MODEL` | Every search with `rerank=true` / `use_agentic=true` |
| B. Summarization | Text/table summaries (incl. chat evidence) | `NORMOL_MODEL` (default `deepseek-v4-flash`) | Ingestion + on demand |
| C. Hierarchy parsing | Heading/outline recognition at ingestion | `HIERARCHY_LLM_MODEL` (falls back to B) | Ingestion only |
| D. Vision/VLM | Image & table understanding | `IMAGE_MODEL` (qwen3-vl family), `IMAGE_MODEL_MAX` | Image/table-heavy docs |
| E. Infrastructure | Transport, per-task overrides, token budgets, mock mode | — | Always |

Groups are independently switchable: each can point at a different provider/model.

## E. Infrastructure — cost control, concretely

1. **One transport** — single timeout/retry/usage policy (`openai_compatible_client_sync.py`).
2. **Per-task overrides** — `shared/services/ai/llm_overrides.py` pins a model/credential per running step, then resets.
3. **Token budget ledger ("wallet")** — `shared/services/retrieval/agentic/core/budget.py`: three pools
   (`bootstrap`, `planning`, `context`); status HEALTHY → TIGHT (≥50%) → CRITICAL (≥80%) → EXHAUSTED;
   the engine stops spending (truncates context, caps planning) rather than overrun.
   Knobs: `RETRIEVAL_WALLET_TOTAL_BUDGET`, `RETRIEVAL_PLANNER_THINKING_BUDGET`, `RETRIEVAL_DECOMPOSITION_MAX_STEPS`.
4. **Mock/degraded mode** — `shared/services/ai/llm_mock.py` + `_should_mock_llm_calls()`; no credentials ⇒ evidence-only.

## On-premise impact

- **No cloud dependency**: point the URLs at a local OpenAI-compatible model server — fully offline.
- **Cost control = resource control**: the wallet counts tokens, bounding GPU/CPU load and latency per query.
- **Predictable capacity**: budgets + step caps + timeout/retry bound worst-case spend per query.
- **Safe degraded mode**: model-server outage degrades to evidence-only, never takes the product down.
- **Heavy item**: Group D (VLM) is the on-prem GPU cost; treat as optional and size separately.
- **Caveat**: the wallet bounds agentic retrieval; groups B/C run per document at ingestion —
  size ingestion throughput against the model server's rate (that's what the 429 retry/backoff is for).

## Recommended enablement order

1. B (summaries) + A-rerank — best quality-per-cost lift
2. C (hierarchy parsing)
3. A-agentic planner (wallet already bounds it)
4. D (VLM) last, only for image-heavy corpora

Rollout is config-only (env vars); suites stay green via the mock path.
