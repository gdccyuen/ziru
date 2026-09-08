# Proposal — Robust section/chapter hierarchy + parse-quality visibility

**Branch:** `feat/gdccyuen/parse-quality-section-hierarchy`
**Status:** Proposed (for review). No production code changed yet; this is the diff outline.
**Motivation:** Numbering-only government docs (G3_EN / PG-for-X / S17 family) get a
broken section/chapter sequence. Root cause chain: source uses only numbering (no
font hierarchy) → MinerU pipeline flattens `#` and drops some chapter numbers → the
engine's heading detection (`max(hash, regex)` + LLM) can't reconstruct the outline.
This was reproduced on the 24-doc corpus (engine regex avg 41% numeric accuracy;
numbering-first resolver avg 98%).

## Decisions (confirmed with you)
- **A3 — resolver default, LLM on fail.** The deterministic numbering resolver builds
  the hierarchy; the hierarchy LLM is only invoked when the resolver's outline-sanity
  score is low.
- **B2 — flag-only on the initial run + manual "Re-parse" button.** No inline VLM
  auto-retry. The initial job records quality; a re-parse job (MinerU `vlm-engine`) is
  triggered by an operator action (the Re-parse button).
- **Visible sign** in the webui **documents** page (admin functions now live in the
  webui app, not the legacy `admin/` app).

---

## Part A — engine: numbering-first resolver (#1/#2) + sanity check (#4)

### A1. Numbering resolver — `core/apps/worker/app/services/document_parser/structure/heading_candidates.py`
- **`get_max_lvl(code_str)` / `judge_by_conditions(...)`:** stop treating a *trailing
  dot* as a deeper level. `5.` must resolve to depth 1 (same as `5`), not 2. Currently
  the POS patterns count every `.` (so `5.` → 2). Adjust so the terminal separator
  after the last number is not counted.
- **Letter/roman items (`(a)`, `(i)`, …):** keep them as heading candidates and assign
  them one level deeper than their numeric parent (a sibling group), instead of
  demoting them to `-1`/body (which currently drops them or flattens them).
- **Banner/classification filter (`(RESTRICTED)`, `CONFIDENTIAL`, `CONTENTS`, …):**
  strip a leading banner prefix and drop pure-banner pseudo-headings so they don't
  become tree nodes. Add these to the negative conditions in `remove_by_conditions` /
  a helper in `_estimate_markdown_heading_level`.
- Changes are **flag-gated** by `NUMBERING_FIRST_HIERARCHY` (default `false`) so the
  behavior can be turned on safely.

### A2. `pred_titles` wiring — `core/.../structure/layout_parser.py`
Implement A3 in the `smart_parse` branch (around lines 636–649):
```python
heading_preds = est_hierarchies_naive(raw_preds, smart_parse, output_dir=output_dir)   # improved resolver
if smart_parse:
    score = outline_sanity(heading_preds)          # number-first resolver score
    if score < settings.OUTLINE_SANITY_THRESHOLD:  # e.g. 0.85
        heading_preds = est_hierarchies_llm(heading_preds, prompt_limt, toc_hierarchies,
                                            model_name=model_name, output_dir=output_dir)
        score = outline_sanity(heading_preds)
    else:
        logger.info("resolver hierarchy OK (score=%.2f), skipping LLM", score)
    # persist quality via sidecar (see A4)
```
- When the resolver yields a good outline, skip the LLM entirely → deterministic,
  faster, and correct for numbered docs. The LLM is reserved for the ambiguous tail
  (non-numbered headings / mixed layouts).

### A3. New module — `core/apps/worker/app/services/document_parser/structure/outline_sanity.py`
Pure, no-LLM helper (reuse the prototype logic):
```
def outline_sanity(heading_preds) -> (score, anomalies)
  # for each numbered heading: detected_level vs numbering depth (1/2/3; (a)->parent+1)
  # score = correct / total ; anomalies = list of {level, key, text, expected}
```
Also expose `outline_sanity_result(heading_preds) -> dict` with `score`, `n_headings`,
`n_anomalies`, `anomaly_samples`, `dropped_number_heads` (headings whose number looks
missing). This is the payload written to the manifest.

### A4. Persist quality (sidecar, no signature break)
Inside `pred_titles` (where the DataFrame lives) write
`{output_dir}/parse_quality.json` with the `outline_sanity_result` (mirrors how
`toc_hierarchies.json` is already written). Downstream reads it and merges it into
`job_metadata` (Part B). This avoids changing `pred_titles`' return type.

### A5. Config keys (`shared/core/config/*.py`)
| key | default | meaning |
|---|---|---|
| `NUMBERING_FIRST_HIERARCHY` | `false` | enable the numbering-first resolver & letter/banner handling |
| `OUTLINE_SANITY_THRESHOLD` | `0.85` | below this, the resolver is considered weak (trigger LLM / flag) |
| `OUTLINE_SANITY_JSON` | `true` | write `parse_quality.json` sidecar |

---

## Part B — parse-quality write + VLM re-parse (B2)

### B1. Per-job backend override — thread `mineru_backend`
1. `core/.../orchestration/parse_input.py` → `ParseOptions`: add
   `mineru_backend: str = ""` (empty ⇒ use global setting).
2. `core/.../orchestration/parse_session.py` (dict, lines 62–70): add
   `"mineru_backend": parse_options.mineru_backend`.
3. `core/.../formats/pdf/parser.py::parse_pdfs`: read `base_llm_paras.get("mineru_backend")`
   and pass `backend=...` to `parse_via_full(...)` (all 3 call sites: lines 75, 175, 218).
4. `core/.../providers/mineru/pdf_service.py::parse_via_full` (line 423): add
   `backend: Optional[str] = None`, forward to `parse_via_local`.
5. `core/.../providers/mineru/pdf_service.py::parse_via_local` (line 181): add
   `backend: Optional[str] = None`; set `"backend": backend or settings.MINERU_LOCAL_BACKEND`
   (line 217).
Note: `parse_via_full` is the **live** entry point (called by `parse_pdfs`); it is a
thin wrapper over `parse_via_local`, which is the only place the backend field is set.

### B2. `parse_pdfs` — compute + record quality (no inline retry)
After the pipeline `parse_via_full` and `parse_md`, read `parse_quality.json` (A4) and
record it into the job's metadata:
- Set `parse_track` on the document to `pipeline` (or `pipeline_low_quality` when
  score < threshold).
- Put `{"parse_quality": {score, anomalies, backend_tried, dropped_number_heads}}`
  into `job_metadata["document_metadata"]`.

Where it lands (verified):
- `publication_service.py:112` reads `job_metadata["document_metadata"]` via
  `JobMetadataHelper.get_document_metadata()` → written to the `documents.document_metadata`
  JSON column (`:216`).
- `lifecycle_service.py:208` returns `document_metadata` in the documents API payload.
- Also mirror into the on-disk parse `manifest.json` (`ZipManifestBuilder.generate_manifest`,
  via its `statistics`/`HIERARCHY`), and set `documents.parse_track`.

### B3. Re-parse endpoint — core API
Add `POST /v2/documents/{document_id}/reparse` (in
`core/apps/api/app/api/v2/routes/documents.py`):
- Looks up the document (visibility-checked), reads its retained original file
  (`document_id` → original source), and creates a **new parse job** with
  `mineru_backend="vlm-engine"` (the per-job override from B1).
- Returns the `JobResponse` (same shape as the ingestion job create).
- Guard: reject if a re-parse is already in flight for that document (409), and require
  `vlm-engine` to be available (config `MINERU_LOCAL_BACKEND`/ability).

### B4. webui — visible sign + Re-parse button
- `webui/src/lib/api.ts`: add `reparseDocument(documentId)` → `POST /v2/documents/{id}/reparse`.
- `webui/src/app/(app)/documents/page.tsx` (`DocumentRow`, ~line 306): 
  - render a **parse-quality badge** from `document.document_metadata?.parse_quality?.score`
    (color: green ≥ threshold, amber < threshold, grey if absent), with a tooltip showing
    anomaly count + `parse_track`;
  - add a **"Re-parse"** button (shown when a badge is present/score < threshold) that
    calls `reparseDocument` and navigates to / prompts the jobs page.
- The existing `(app)/jobs` page shows the re-parse job (already present).
- `DocumentItem` already carries `document_metadata` (`api.ts:65`), so no type change
  needed for the badge.

### B5. Where the score is notable / queryable (summary)
| Surface | Where | Queryable |
|---|---|---|
| `documents.document_metadata` JSON | set at publication (`:112`/`:216`) | yes (SQL + documents API) |
| documents API payload | `lifecycle_service.py:208` | yes |
| on-disk `manifest.json` | per-doc audit artifact | internal/audit |
| `documents.parse_track` | `pipeline` / `pipeline_low_quality` | yes (SQL) |
| webui documents page badge | `DocumentRow` | human-visible (new) |

---

## Testing & rollout
1. **Unit:** `outline_sanity` against the 24-doc corpus expectations (score ~1.0 for
   numbering-first, ~0.4 for the old regex path).
2. **Engine regression:** run the existing `core/apps/worker/tests` (esp. the
   `pred_titles`/`heading_candidates` and docx/pptx heading tests) with
   `NUMBERING_FIRST_HIERARCHY=true` and `false`; only `true` is a behavioral change.
3. **API contract:** add a test for the re-parse endpoint (401 unauth, 404 missing,
   409 in-flight, success returns a job).
4. **webui:** vitest for the badge/Re-parse button; visual check on the documents page.
5. **Manual end-to-end:** ingest G3_EN (pipeline) → see low-quality badge → click
   Re-parse → job runs under `vlm-engine` → document revision updates → badge clears.

## Risks / open questions
- **LLM vs resolver (A3):** skipping the LLM for good-resolver docs changes existing
  behavior for non-numbered docs; keep the threshold conservative and flag-gated.
- **Shared regexes:** `/RESTRICTED/` and letter-item changes affect all formats
  (md/docx/pptx) — regression-test broadly.
- **Dropped-number headings** (G3_EN `8.`, by-Design `Post-Implementation Review`,
  Wi-Fi, ISIH) can't be fully repaired by numbering alone; these are exactly the
  docs the VLM re-parse targets. A3 should still flag them (low score) so they show
  the Re-parse badge.
- **VLM cost/availability:** the Re-parse button requires the local MinerU VLM
  backend (GPU/MPS + models) to be available; document the operational requirement.
