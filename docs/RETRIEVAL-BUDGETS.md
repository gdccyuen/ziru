# Retrieval Budgets & Limits

Status: verified against the live stack on 2026-09-XX (see "Live verification" below).
All values below are **LLM-token / latency guardrails** — Ziru has no billing or credit system.

## 1. User-tunable parameters (UI: chat threads and the Search page)

| Parameter | UI default | UI slider range | API hard cap (chat) | Meaning |
|---|---|---|---|---|
| Rerank | **On** | On/Off switch | n/a (flag) | Accepted + stored; the frozen engine's executed routes currently call no rerank step, so the flag is inert until a rerank pass is implemented |
| Top K (`top_k`) | 8 | 1–50 | 1–50 | Max final results returned |
| Recall K (`internal_recall_k`) | 30 | 10–200 (step 5) | 1–200 | Per-channel fetch width *before* ranking — the true search-breadth cost |
| Agentic (`use_agentic`) | **On** | On/Off switch | n/a | Enables LLM planning + document navigation workflow; ~3–5+ LLM calls per turn |

Notes:
- When `internal_recall_k` is omitted, the engine uses `top_k × 2`
  (`INTERNAL_RECALL_K_MULTIPLIER = 2`, shared/services/retrieval/settings.py).
- Server defaults for chat threads without stored params:
  `chat_service.DEFAULT_RETRIEVAL_PARAMS` = rerank **true**, top_k 8, recall 30, agentic **true**.
- Web UI fallbacks mirror the same defaults (webui/src/lib/api.ts).

## 2. Always-on engine constants (classic + agentic)

- Small-corpus short-circuit: when scoped chunk count ≤ top_k, all chunks are returned with **zero LLM calls**.
- RRF fusion constant `RRF_K = 60`; channel weights: term 1.5, path 1.0, content 2.0.
- Valid chunk types: `text | image | table | page` (image/table = asset types).
- Section-exclusion paging multiplier: 2× top_k.
- Retrieval result cache keyed by query/top_k/filters (Redis).

## 3. Agentic-mode budgets (workflow orchestrator)

Environment variable | Default | Meaning
--- | --- | ---
`RETRIEVAL_PLANNER_THINKING_BUDGET` | 4,000 tokens | One LLM call that decomposes the question into a plan
`RETRIEVAL_WALLET_TOTAL_BUDGET` | **200,000 tokens/run** | Hard cap across all steps of one turn
`RETRIEVAL_WALLET_PER_RETRIEVE_STEP_BUDGET` | 40,000 tokens | Per-step ledger allocation (floor 4,000)
`RETRIEVAL_DECOMPOSITION_MAX_STEPS` | 5 | Max sub-queries per turn
`RETRIEVAL_WORKFLOW_PARALLEL_MAX` | 3 | Concurrent LLM work
`RETRIEVAL_AGENTIC_MAX_NAV_STEPS` | 6 | Navigation steps per document
`RETRIEVAL_AGENTIC_LATENCY_BUDGET_MS` | 30,000 ms | Stop reason `latency_budget`
`RETRIEVAL_AGENTIC_PLANNING_RATIO` | 0.5 | Split of remaining step tokens: planning vs context
`RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET` | 2,000 tokens | Set aside for document-selection call
`RETRIEVAL_AGENTIC_PER_DOC_MIN_SHARE` | 1,500 tokens | Per-document floor; weighted soft caps stop one doc eating the pool

Per-step ledger pools: **bootstrap / planning / context** with status thresholds —
HEALTHY < 50% used, TIGHT ≥ 50%, CRITICAL ≥ 80%, EXHAUSTED at 0.
Low-priority LLM calls are refused while CRITICAL; reservations are committed/refunded
after each call; an exhausted pool raises `BudgetExceeded` and the step reports a budget stop.

## 4. Live verification (what the trace shows)

An Agentic turn returns a `decision_trace`; each entry carries a `budget` snapshot like:

```json
{ "planning": {"capacity":19000,"used":0,"remaining":19000,"status":"HEALTHY"},
  "context":  {"capacity":19000,"used":0,"remaining":19000,"status":"HEALTHY"},
  "total_chunks": 1910, "total_docs": 22, ... }
```

- 2026-09 live check found Agentic runs finishing in <1 s with 0 tokens used and
  `stop_reason: no_documents_selected`: the containers were started **without**
  `NORMAL_MODEL` / `RETRIEVAL_PLANNER_MODEL`, so the retrieval LLM adapter disabled itself
  and the workflow fell back to discovery-only. Fixed by forwarding the model env vars
  from deploy/.env in deploy/compose.yaml (api + worker).
- Re-run after the fix should show used tokens > 0, multi-second elapsed time, and a
  selected-document navigation trace.
- Second live finding: with the model env restored, the **document-selection LLM call
  was still skipped** ("bootstrap budget exhausted") because the per-step bootstrap
  pool (2,000 tokens) is far smaller than the knowledge-map overview prompt on a real
  corpus (up to 50 documents with summaries). The container deployment raises
  `RETRIEVAL_AGENTIC_BOOTSTRAP_BUDGET=30000` and
  `RETRIEVAL_WALLET_PER_RETRIEVE_STEP_BUDGET=120000` in deploy/.env; the same symptom
  on another corpus should be fixed by raising these two (they are now forwarded by
  deploy/compose.yaml and documented in deploy/.env.example).
- Third finding — **addressed with the P1 selection ladder** (implemented in
  `agentic/discovery/phase.py`): the LLM document-selection step is unreliable on a real
  corpus (narrow wordings returned empty ~60% of the time in eval). P1 now runs:
  1. original LLM selection;
  2. if empty → one **auto-broadened retry** (LLM restates the question more broadly,
     discovery hints recomputed for the new wording);
  3. if still empty → **BM25 top-document fallback** (zero LLM cost).
  The container deployment raises `RETRIEVAL_AGENTIC_LATENCY_BUDGET_MS=240000` in
  deploy/.env so the added retry time does not starve navigation (the latency check
  runs between document selection and navigation).
