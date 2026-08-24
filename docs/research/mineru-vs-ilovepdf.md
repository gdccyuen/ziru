# MinerU vs iLovePDF for Office documents

Retrieved 2026-08-24 from primary sources (GitHub, official docs, ilovepdf.com / developer.ilovepdf.com). Scope: can MinerU handle DOCX/XLSX/PPTX natively, and how does it compare to iLovePDF for Ziru's self-hosted, on-premise knowledge engine.

## TL;DR

- **MinerU: yes.** Current stable **3.4.5** natively parses **DOCX (since 3.0.0, 2026-03-29)** and **PPTX + XLSX (since 3.1.0, 2026-04-18)**. It runs fully offline/self-hosted (CLI / FastAPI / Docker / Gradio) and its license now permits commercial on-premise use.
- **iLovePDF: a SaaS converter, not a self-hostable parser.** It converts Office -> PDF but does not produce structured Markdown/JSON. **No on-premise or self-hosted server/API offering exists.** Free API tier = **2,500 credits/month**; Office-to-PDF costs **10 credits/file => ~250 files/month** (matches Ziru's code notes).
- **They are not competitors for the same job.** MinerU extracts structure; iLovePDF only renders/converts. For Ziru, use MinerU native office parsing first, LibreOffice->PDF->MinerU OCR for complex/scanned files, and iLovePDF only as an optional quota-limited burst/fallback.

## 1. MinerU office-format support today

| Format | Native since | Notes |
|---|---|---|
| PDF / images | long-standing | OCR + VLM/hybrid/pipeline backends; 109-language OCR |
| DOCX | **3.0.0** (2026-03-29) | Native parse: high-precision without hallucinations; tens of times faster than docx->PDF->parse |
| PPTX | **3.1.0** (2026-04-18) | Native parse added with XLSX |
| XLSX | **3.1.0** (2026-04-18) | Native parse added with PPTX |

- Current PyPI version: **3.4.5**; repo master is ahead with further office fixes (chart-as-SVG rendering, nested-table preservation, merged-cell image anchoring, defusedxml hardening).
- Backends: **pipeline** (fast, stable, no hallucination, CPU/GPU), **vlm-engine**, **hybrid-engine** (VLM + OCR dual engine, high accuracy). Official README: converts PDF, DOCX, PPTX, XLSX, images and web pages into structured Markdown/JSON.
- **Quality/limitations (office path):** community tracing (issue #5406) shows local open-source office parsing is a lightweight native OOXML rule path (auto), separate from OCR/VLM; the is_ocr switch is ignored for DOCX/PPTX/XLSX locally, while mineru.net's online API appears to run an OCR/visual pipeline for office files and can produce better results on complex tables/images/formulas. So native office parse = fast, deterministic, good for born-digital text/tables; for complex charts, vector-path formulas, or scanned/legacy content, fall back to LibreOffice/PDF -> MinerU OCR. PPTX native charts historically flattened to HTML tables; chart-as-SVG is in flight (PR #5333).

## 2. iLovePDF capabilities, free tier, self-hosting reality

- **What it does:** web/mobile/desktop tools and a REST API (**iLoveAPI**) for merge/split/compress/convert/OCR/sign, including WORD->PDF, POWERPOINT->PDF, EXCEL->PDF. It is a rendering/conversion service; it does **not** output structured Markdown/JSON or reading order, so any downstream knowledge pipeline still needs a parser (e.g. MinerU) on the PDF it produces.
- **Web free tier:** Basic is free with limited tools/documents and a **100 MB** file cap; Premium is **$4/user/month** (annual; $7 monthly) for 1-25 users; Business is custom for 25+.
- **API free tier:** **2,500 credits/month** on registration; Office-to-PDF = **10 credits/file** => **~250 files/month**. Paid subscription/prepaid credit packages available; Digital Signature credits are not free.
- **Self-hosting: NO.** iLovePDF is a cloud SaaS: files are uploaded to and processed on iLovePDF servers (ISO 27001 certified; regional processing on paid plans). The macOS/Windows **Desktop app** can process some tools **offline/locally**, but it is a per-user GUI client, not a hostable server or API, and web/mobile/API remain cloud. Independent comparisons list iLovePDF as documents-uploaded-to-cloud and point self-hosters to Stirling-PDF instead. **No iLovePDF on-premise/self-hosted product was found.**

## 3. Comparison

| Criterion | MinerU 3.4.5 | iLovePDF |
|---|---|---|
| Office input | DOCX/PPTX/XLSX native parse -> Markdown/JSON | DOCX/PPTX/XLSX -> PDF conversion only |
| Tables / charts / images | Native OOXML extraction; PDF path extracts tables as HTML, formulas as LaTeX, images + captions; chart-as-SVG maturing | Preserves rendered layout in PDF; fidelity on complex charts/formulas not vendor-benchmarked; no structure output |
| CJK text | 109-language OCR (PDF path); native office text passes through as text | Renders CJK in PDF (font/engine dependent); still needs downstream OCR/extraction |
| Offline / on-premise | Yes: CLI/FastAPI/Docker, CPU or GPU, fully offline | **No self-host/on-prem**; Desktop app = local GUI only, not a server |
| Cost | Free OSS; models downloadable | Free tier limited; Premium $4/user/mo; API 2,500 free credits/mo then paid |
| Licensing | MinerU Open Source License (Apache-2.0-based since 3.1.0; was AGPLv3 before) | Proprietary SaaS |

## 4. Verdict + Ziru recommendation

**Verdict:** MinerU is the correct primary tool for office documents in a self-hosted on-premise knowledge engine; iLovePDF cannot replace it and cannot be self-hosted. iLovePDF is only a rendering aid with a ~250-file/month API quota and data-egress concerns.

Recommended hierarchy for Ziru office docs:

1. **MinerU native parse** for born-digital DOCX/PPTX/XLSX (fast, offline, no hallucination).
2. **LibreOffice -> PDF -> MinerU (pipeline/hybrid OCR)** for complex layouts, charts, formulas, scanned pages, and legacy .doc/.xls. Ziru already fails open to LibreOffice per its code, so this is the natural fallback.
3. **iLovePDF SaaS** only as an optional, quota-managed burst/fallback when LibreOffice rendering fidelity is insufficient; never the primary path (SaaS, quota, files leave the network).

**License note:** MinerU moved from **AGPLv3** to the **MinerU Open Source License** (Apache-2.0-based custom license) in 3.1.0. Commercial on-premise use is permitted; a separate commercial license is required only above **100M MAU** or **$20M/month revenue**, and online services built on MinerU must visibly attribute it. This is compatible with Ziru's commercial on-prem deployment.

## Sources

- [MinerU GitHub README](https://github.com/opendatalab/MinerU)
- [MinerU LICENSE.md](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md)
- [MinerU 3.0.0 release (native DOCX)](https://github.com/opendatalab/MinerU/releases/tag/mineru-3.0.0-released)
- [MinerU 3.1.0 release (PPTX/XLSX + license change)](https://github.com/opendatalab/MinerU/releases/tag/mineru-3.1.0-released)
- [MinerU changelog](https://opendatalab.github.io/MinerU/reference/changelog/)
- [MinerU PyPI 3.4.5](https://pypi.org/project/mineru/3.4.5/)
- [MinerU issue #5406 (office forced to auto path, is_ocr ignored locally)](https://github.com/opendatalab/MinerU/issues/5406)
- [MinerU PR #5333 (PPTX charts as SVG)](https://github.com/opendatalab/MinerU/pull/5333)
- [iLovePDF pricing](https://www.ilovepdf.com/pricing)
- [iLoveAPI pricing (2,500 free credits/mo, Office-to-PDF 10 credits/file)](https://developer.ilovepdf.com/pricing)
- [iLoveAPI API reference](https://www.iloveapi.com/docs/api-reference)
- [iLovePDF Web vs Desktop (desktop offline processing)](https://www.ilovepdf.com/blog/pdf-web-or-desktop)
- [Stirling-PDF vs iLovePDF (self-host comparison; iLovePDF = cloud)](https://selfhosting.sh/compare/stirling-pdf-vs-ilovepdf/)
