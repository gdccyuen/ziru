# Ziru.1 wire-and-measure baseline (running fork)

Measured against the **already-running self-hosted Ziru fork** (deploy compose
stack, API on :5005) using the SecDocs eval set
(`docs/samples/SecDocs/eval/queries.yaml`, 55 queries). No Ziru.1 code was
written; this only runs the existing engine and grades it.

## Setup

- Corpus: 23 SecDocs PDFs are already ingested into the live stack (prior
  session). Verifed all 23 are `active` with chunks + sections; archived 3
  stale duplicate `PG for DLP_EN.pdf` revisions so there is exactly **one
  active document per source file** (23 active docs).
- Auth: created a local API key (`sk_…`) bound to the admin account
  (all-access, profile-bypass) and called `POST /v1/retrieval/query`.
- Grading: used the eval `grading` rules (top_k = 8, section match =
  segment-wise). Ran **classic** (`use_agentic: false`) at `top_k=8` and
  `top_k=50`, plus a small **agentic** sample.

## Headline numbers

| Metric | Classic @8 | Classic @50 |
|---|---|---|
| Queries fully passing | **10 / 55 (18.2%)** | **14 / 55 (25.5%)** |
| Document recall (expected doc in returned set) | 53 / 55 (96.4%) | **55 / 55 (100%)** |
| Section-path failures | 46 | 41 |
| Chunk-substring failures | 24 | 10 |
| Median latency (s) | 0.42 (0.28–0.53) | ~0.4 |

## Decomposition (what is actually going on)

1. **Document selection is strong.** 96–100 % of queries return the expected
   document(s). The engine is not failing to find the right file.
2. **The bottleneck is section-level alignment.** Only **16 / 55** expected
   section paths are present in the DB `document_sections` tree
   (segment-subset match). For the other 39 the engine’s rebuilt hierarchy
   does not reproduce the eval’s expected path (different root/top-level
   segments, occasionally genuinely mangled subtrees).
3. **Ranking depth also bites when the section does exist.** Of the 16 where
   the section path exists, 14 pass at top_k=50 but only 10 at top_k=8. The
   correct chunk is frequently ranked ~13–43 (e.g. SD-002 rank 14, SD-027 rank
   13, SD-045 rank 43).
4. **The answer text is in the corpus.** Chunk-substring evidence exists in the
   DB for **50 / 55** queries (right chunk type + expected substring for the
   expected doc). So the text is indexed; it is not being surfaced at the right
   section/rank.
5. **Table representation check fails, not retrieval.** The 3 table
   expectations (SD-004, SD-005) fail because Ziru indexes tables by
   summary + keywords + caption, and the human-readable substring lives there,
   not in `chunk.content` that the grader inspects. SD-004’s section was found
   at rank 0 — the table was retrieved, this is a grader-vs-representation
   mismatch.
6. **Genuine intake defects in a few docs.** `G3_EN.pdf`’s section tree is
   visibly corrupted: TOC lines and long sentences become headings
   (e.g. `(b) Password Policy... . 44`, `(a) Sanitisation: refers to …`),
   which breaks SD-006…SD-010. A few other expected paths simply do not exist
   (Penetration Testing §2.1.2, Security Log Management
   “Security Information and Event Management”).

## Caveats

- The eval set was authored from MinerU `backend=pipeline` parsed markdown;
  the running stack rebuilds headings with its own hierarchy predictor, so the
  section paths diverge. The 18 % at top_k=8 therefore reflects **both** a
  representation mismatch (section-path convention) **and** real ranking/recall
  limits.
- Admin all-access bypasses profile scope, so SD-010 (a `topic`-filter
  scope check) is not exercised as written.
- Agentic sample: SD-001 passed in **78.8 s** (routed `workflow_single_step`)
  vs 0.33 s classic. The rest of the 6-query agentic sample was still running
  when this was written; agentic is ~orders of magnitude slower on the local
  27B LLM, so a full 55-query agentic run is not practical for a quick
  baseline.

## Outlook / next levers

- **Fix intake heading reconstruction** on these PDFs (TOC-aware, avoid
  page-number/TOC lines and long sentences becoming headings, normalise the
  doc-title root segment). This is the single largest lever and is precisely
  what the Ziru.1 modular intake seams + eval harness are meant to expose.
- **Reconcile the section-path convention** between the eval and the corpus
  (the eval prepends the MinerU doc-title root; the engine uses different
  top-level segments) before trusting the section-recall number.
- **Raise effective recall** or improve per-section ranking — correct evidence
  often sits at rank 13–43.
- **Align table grading** with the composed search field
  (summary+keywords+caption), or make `chunk.content` for tables carry the
  human-readable text.
- Agentic is not a latency-viable default on this local LLM stack; keep the
  classic-first hybrid strategy in mind.
