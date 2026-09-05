# Plan: Tune the Agentic Fallback (doc cap, early stop, relevance gate)

Status: recommended plan, **not yet implemented** — written for fresh review.
Related: docs/SYSTEM-FLOWCHARTS.md shows where these changes sit in the big picture.

## Why this plan exists (one-paragraph summary)

The P1 ladder (original LLM selection → auto-broadened retry → BM25 fallback) fixed
turns that previously returned no evidence. The full HTTP eval then exposed two
remaining problems: (1) a 5-document BM25 fallback walks documents one-by-one until
the 240 s latency budget, so the right document can still be missed (Q3A) and turns
can take up to ~5 minutes; (2) clearly out-of-scope questions (milk pasteurization,
drone rules) fall into the same fallback and burn minutes producing noise (N1: 85k
chars of irrelevant "evidence" in 227 s). This plan fixes both with configuration +
small, engine-local changes, and validates them with measurements before locking defaults.

## Recommended decisions (locked unless review objects)

| Topic | Recommended default | Reason |
|---|---|---|
| Fallback pool size | Top **3** documents | Cuts worst-case time; verified against real ranks before locking |
| Fallback ordering | By **best RRF discovery score per doc**, not hit-count | Today's order counts matching chunks; one strong match should beat many weak ones (to be verified — Q3A case) |
| Early stop | **Fallback docs only**: stop after the first fallback doc that yields hydrated evidence | Saves time without hurting deliberate LLM-selected multi-doc answers |
| Relevance gate | Score threshold on fallback candidates; **clean empty** result when blocked | Keeps out-of-scope turns short and honest |
| Gate scope | Fallback path only (LLM-selected docs unaffected) | Two LLM votes already said "relevant" — don't second-guess them |
| Calibration first | Measure scores across ~14–16 questions before setting the threshold | Thresholds must come from this corpus, not guesswork |

## Phase 0 — Calibration (do first, ~30–45 min)

1. Add temporary INFO logging on the fallback path: per candidate doc → name, hit
   count, best score; plus the overall top-5 scores.
2. Run the existing 10-question eval set + 4–6 clearly out-of-scope variants
   (milk, drones, cooking, shipping, tax…).
3. Produce two score populations (in-scope vs out-of-scope) and pick
   `RETRIEVAL_AGENTIC_FALLBACK_MIN_SCORE` between them. If the populations overlap,
   present the trade-off (small false-gate risk vs small noise risk) with the numbers.
4. Also record each question's target-doc rank under (a) hit-count order and
   (b) score order → decides whether cap 3 suffices or cap 4 / merged pool is needed.

Deliverable: a short calibration table in this doc or an appendix file.

## Phase 1 — Fallback pool: score order + cap

- New env: `RETRIEVAL_AGENTIC_FALLBACK_MAX_DOCS` (default 3),
  `RETRIEVAL_AGENTIC_FALLBACK_ORDER` (default `score`).
- Code: `agentic/discovery/phase.py` → `_fallback_to_discovery_top_docs` builds the
  candidate pool from `fused_rows` (doc → best `discovery_score`), orders by score,
  takes the top N.
- If calibration shows the target routinely sits at rank 4–5, fall back to cap 4 or
  merge the broadened retry's discovery list into the pool before ordering (decision
  recorded after Phase 0).

## Phase 2 — Early stop after first evidence doc (fallback only)

- New env: `RETRIEVAL_AGENTIC_NAV_EARLY_STOP` = `fallback` | `all` | `off` (default `fallback`).
- Code: `agentic/navigation/document.py` → in `navigate_selected_documents`, after
  each doc's navigation+hydration: if policy applies and this doc produced ≥1 hydrated
  chunk, stop the loop; log + decision-trace note `evidence_sufficient`.
- LLM-selected navigation keeps current behavior (multi-topic questions need several docs).

## Phase 3 — Relevance gate before fallback

- New env: `RETRIEVAL_AGENTIC_FALLBACK_MIN_SCORE` (value from Phase 0),
  `RETRIEVAL_AGENTIC_FALLBACK_MIN_HIT_DOCS` (default 1).
- Code: in `_select_documents`, between "broadened retry empty" and the fallback:
  if the pool's best score < threshold → skip fallback, log
  `agentic: relevance gate blocked BM25 fallback (top_score=…)`, and finish the turn
  with a clean empty result: no evidence, no results, `stop_reason: no_relevant_documents`.
- Chat then answers honestly ("I couldn't find relevant documents…") instead of
  synthesizing from noise. Decision: clean empty (recommended) vs "top BM25 chunks as
  best-effort" — confirmed in review.

## Phase 4 — Tests, docs, deployment, re-validation

1. Unit tests (mocked discovery payloads): fallback ordering/cap, gate on/off,
   early-stop policy variants.
2. Forward the new envs in `deploy/compose.yaml`; document in `.env.example` and
   `docs/RETRIEVAL-BUDGETS.md`; add the glossary note in the flowcharts doc.
3. Re-run the HTTP eval (10 questions) with acceptance criteria:
   - Q3A: target found **or** documented short residual (< 90 s), never a 306 s miss;
   - N1/N2: clean empty, no navigation, < 60 s;
   - Q1A/Q2A/Q4A + all B questions: no regression (target still hit);
   - worst-case turn ≤ 240 s (fits the 300 s web proxy cap).

## Explicitly out of scope (this round)

- Rerank implementation (flag stays inert).
- Changing LLM-selected navigation quality/budgets.
- Chat answer presentation changes.

## Files that will change (when approved)

`agentic/discovery/phase.py`, `agentic/navigation/document.py`,
`agentic/core/types.py`, `agentic/core/runtime.py`, `deploy/compose.yaml`,
`deploy/.env.example`, `docs/RETRIEVAL-BUDGETS.md` (+ this plan's calibration appendix).
