# Handoff: table chunk HTML dropped at parse-flatten (self-hosted local MinerU)

**Status:** RESOLVED — root cause was stale; see "Actual findings (2026-08-09)" below. Backend hardening shipped: `Ontos-AI/knowhere` PR #249 (asset URLs no longer presigned for missing files). Notebook Phase 3 remains open.

## Actual findings (2026-08-09)

**The reported bug does not reproduce with MinerU 3.4.0.** A fresh end-to-end parse of a 91-page FAF PDF (job `job_53921811645e`, namespace `tabletest`) produced:

- **215 `tables/*.html`** objects in `knowhere-results` (+ `mineru_raw.zip`), all fetchable via presigned `asset_url` (HTTP 200 with real `<table>` HTML).
- The chunk API returned 47 table chunks with working URLs.

**Why the old adobe docs (job_4182ffc660c7) are table-less:** that job has **zero** S3 objects at all (not even the job zip) — the whole result was lost, likely to a pre-existing bug that is already fixed or environment-specific cleanup. Its chunks survived in the DB with `metadata.file_path` + a presigned URL → **dangling 404 URLs** (real, verified).

**Root-cause chain in the original diagnosis was wrong for MinerU 3.4.0:**
1. `_flatten_extracted_zip` (`apps/worker/.../mineru/pdf_service.py`) does NOT drop tables. The 3.4.0 response ZIP layout is exactly `{stem}/auto/{stem}.md` + `{stem}/auto/images/*` (+ `{stem}/{stem}_origin.pdf` outside `auto/`, which flatten currently removes). **No `tables/` dir exists in the ZIP** — MinerU 3.4.0 renders tables as **inline `<table>` HTML inside the markdown** (215 blocks in the test md, 0 `tables/` refs, 0 `image_page_*` names).
2. Table HTML files are **created by the chunker itself**: `build_markdown_table_asset` (`formats/markdown/table_asset.py`) writes `tables/table-N <name>.html` into the parse output dir from the inline HTML, and the chunk content is the `[tables/...]` ref by design. That dir is picked up by `ZipResourceCollector._collect_table_files` and uploaded — verified working.
3. `response_format_zip=true` IS honored by 3.4.0 (synchronous ZIP response; the JSON inline fallback only happens when the flag is absent/ignored).
4. `image_page_N_table_M.png` names come from the **page-memory** module (`page_assets.py`), not MinerU — a separate table-as-image flow.

**Shipped hardening (PR #249):** `_document_chunk_asset_url` (`apps/api/app/services/documents/lifecycle_service.py`) now verifies the raw artifact exists (`verify_raw_exists`) before presigning; missing files → `asset_url: null` + warning log (fail closed on storage errors). Stale chunks no longer expose 404 URLs. Verified live: adobe doc 18 table chunks → 0 URLs; fresh doc 47 → 47 working URLs.

**Kept on local test branch only (not PR'd):** `keep_exts` += `".html"` in `_flatten_extracted_zip` + unit test (`test_flatten_preserves_html_tables`) — harmless future-proofing for MinerU builds that may emit `tables/` in the ZIP, but a no-op for 3.4.0. Cannot be PR'd to main yet because `_flatten_extracted_zip` itself is still in an unmerged local-mineru PR.

## Original diagnosis (superseded)

Every table chunk in the adobe workspace (`25034–25136.pdf`) showed the summary fallback in the notebook instead of rendered HTML. Root cause was believed to be the worker discarding `tables/*.html` during local-MinerU zip flattening, making them absent from S3, job zips, and `assetUrl` (404). **This was wrong** — the real state was: those jobs' entire results are missing from S3 (0 objects), and the API presigned URLs unconditionally.

## Notebook follow-up (Phase 3, still open)

- Add a warn log in `src/domains/chunks/server.ts` `enrichChunksWithAssetUrls` on asset fetch failure/404, then re-verify a table chunk end-to-end in the notebook UI.
- With PR #249, missing files now arrive as `asset_url: null` — the notebook should treat null as "no asset available" (skip quietly), and only warn when a non-null URL fails.

## Rebuild + verify (reproducible)

1. Upload any FAF PDF: `./upload-pdf.sh <API_KEY> <file.pdf> <namespace>`
2. Wait for `status: done` in the job API.
3. S3 check: `curl "http://127.0.0.1:4566/knowhere-results?list-type=2&prefix=results/<job_id>/"` → expect `tables/*.html` keys + `mineru_raw.zip`.
4. Chunk check: `GET /v2/documents/<doc_id>/chunks?include_asset_urls=true` → table chunks have fetchable URLs.

## Gotchas

- `MINERU_LOCAL_MODE=true`, `MINERU_URL=http://host.docker.internal:8000`; app container runs worker in-process (single `app` service).
- MinerU 3.4.0 `/file_parse` is async-friendly: POST returns a ZIP immediately when `response_format_zip=true`; without it you get JSON with a `status_url`/`result_url`.
- Old adobe sources stay table-less until re-uploaded/re-parsed (their S3 results are gone).
