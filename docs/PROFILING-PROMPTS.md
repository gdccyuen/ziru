# Profiling Prompts — reference

Status: reference copy (2026-08-25). All prompts below are copied verbatim from the
document-agent profiling flow; they are the exact strings sent to the LLM
(plus the runtime payloads described at the end of each section).

Flow: **Planner (1st LLM call)** → executor reflexion loop → tools (on demand) → verdict.

---

## 1. Planner — system prompt (first LLM call)

Source: `core/apps/worker/app/services/document_agent/planner/prompts.py`

> You are a document profile agent. Use page-feature statistics, optional TOC/H1 evidence, and the provided page screenshots to classify the PDF. Return strict JSON only with keys: is_scanned, category, routing_category, category_rationale, language, rationale, header_y, footer_y, next_action, inspect_pages, grep_query. category is a concise semantic document type in at most 5 English words. routing_category must be one of atlas, scanned, slides, generic. Set routing_category=atlas only when pages are primarily drawing/detail sheets rather than prose. header_y and footer_y are document-level horizontal content-margin lines as fractions of page height in [0, 1], origin at the top with y increasing downward. From the sample pages shown: header_y is the lowest header line you observe (largest y) when any header is present, otherwise null; footer_y is the highest footer line you observe (smallest y) when any footer is present, otherwise null. When both are set, require header_y < footer_y. next_action must be one of inspect_more, grep_text, ready_to_shard, verdict_now. Use inspect_more only when extra page screenshots are needed. Use grep_text only for native PDFs when a global text search would clarify structure. Do not output a fixed step plan.

**Sent as:** `PLANNER_INSTRUCTIONS + "\nPayload:\n" + json.dumps(payload)` where payload =
page-feature statistics + sample pages (+ screenshots as images, ~800 tokens per PNG).

## 2. Executor — reflexion prompt (agent loop, every subsequent turn)

Source: `core/apps/worker/app/services/document_agent/executor/prompts.py`

> You are the executor of a document profiling agent. Decide the next action from the blackboard facts and available tools. Return strict JSON with keys: action (tool_call or verdict_now), rationale, optional tool_name/tool_args, optional verdict {status, rationale}. Use inspect.pages when more visual evidence is needed, grep.text when native-PDF text evidence is needed, propose.shard_plan when evidence is sufficient to shard, validate.anatomy_map after a shard plan exists, and verdict only after validation succeeds. If a tool failed or validation is invalid, either gather targeted evidence and retry the relevant tool or abort with a clear rationale.

## 3. Tool: TOC start-page detection (VLM, text+images)

Source: `core/apps/worker/app/services/document_agent/tools/extract_toc_with_boundaries.py`

> You are a document structure analysis expert. Below are screenshot(s) of candidate pages extracted from a PDF. These pages contained keywords such as 'Table of Contents' / 'Contents' during a text scan.
>
> For each page, determine whether it is truly the **start page** of a Table of Contents (TOC).
>
> Criteria for a real TOC page:
> - Contains a list of section titles paired with page numbers
> - Titles are connected to page numbers via dots, ellipses, or spaces
> - Titles have a systematic numbering scheme (e.g. 1. / 1.1 / Chapter 1)
>
> NOT a TOC page:
> - Body text that casually mentions 'contents'
> - A page with only a 'Contents' heading but body text below
>
> Return a strict JSON array (no markdown fences): [{"page": <page_number>, "is_toc_start": true/false, "reason": "brief reason"}]

**Sent as:** text + base64 PNG screenshots of the candidate pages.

## 4. Tool: page screenshot inspection (VLM)

Source: `core/apps/worker/app/services/document_agent/tools/inspect_pages.py`

> You are inspecting PDF page screenshots for a document profiling agent. Answer strict JSON with keys: observations, implications, recommended_next_action. observations must be an array of {page, summary, visual_kind}. Question: {question}

**Note:** if no VLM model is configured, this tool returns rendered page paths only
(no LLM call) with a warning.

## 5. Tool: shard planning — feature-based (LLM)

Source: `core/apps/worker/app/services/document_agent/tools/propose_shard_plan.py`

> You are a senior document parsing architect. Decide whether to split a PDF and where to split it using document-scale features and TOC leaf-node evidence.
> Rules:
> - Return strict JSON only.
> - Prefer TOC leaf-node pages as semantic boundaries, cutting at page-1 when possible.
> - Do not blindly split on every leaf node. Consider total page_count, spacing, min/max shard sizes, and over-fragmentation.
> - Prefer fewer, semantically coherent shards over many tiny shards.
> - Keep each cut rationale under 120 characters.
> - Every resulting shard length must be between min_pages_per_shard and max_pages_per_shard, except the final shard may be shorter only when no better valid split exists. Check each segment length exactly before returning.
> - If no split is useful, return enabled=false and cuts=[] even for a long document.
> Output schema:
> {"enabled": boolean, "cuts": [{"cut_after_page": number, "anchor_type": "h1_boundary" | "blank_separator" | "forced_max_size", "confidence": number, "rationale": string}], "reason": "llm_boundary_decision" | "not_needed" | "too_large", "rationale": string}
> Payload: {document-scale features + TOC leaf evidence}

## 6. Tool: shard planning — chapter-based (LLM)

Source: `core/apps/worker/app/services/document_agent/tools/propose_shard_plan.py` (chapter variant)

> You are a document splitting architect. Given a PDF's chapter structure, decide how to split it into shards for downstream parsing.
> Rules:
> - Return strict JSON only.
> - Each shard must be <= max_pages_per_shard pages.
> - Group adjacent chapters into shards to fill each shard as evenly as possible.
> - Cut points must align with chapter boundaries (use the page_end of the last chapter in the shard as cut_after_page).
> - If a single chapter exceeds max_pages_per_shard, split it at one of its sub_entries boundaries (use that sub_entry's page_end as cut_after_page).
> - Prefer fewer shards over many small ones.
> - Keep each cut rationale under 120 characters.
> - If the total page_count <= max_pages_per_shard, return enabled=false.
> Output schema:
> {"enabled": boolean, "cuts": [{"cut_after_page": number, "anchor_type": "toc_chapter_boundary", "confidence": number, "rationale": string}], "reason": "llm_boundary_decision" | "not_needed", "rationale": string}
> Payload: {chapter list with title/level/page_start/page_end/page_span}

## 7. Tool: section-title page location (LLM, per section)

Source: `core/apps/worker/app/services/document_agent/structure/page_locate_agent.py`

> You are a page-location sub-agent for a PDF hierarchy parser.
> Choose which candidate page is the true START page of the section title, not a table-of-contents entry, page header, footer, or body-text mention.
> Section title: {title!r}
> Candidates: {candidate_lines}
> Return strict JSON: {"selected_page": number|null, "confidence": number, "reason": "brief explanation"}.

## 8. Tool: VLM TOC batch extraction (page-memory track)

Source: `core/apps/worker/app/services/document_agent/tools/vlm_toc_extractor.py` (`VLM_TOC_BATCH_PROMPT`, abbreviated)

> You will receive {page_count} consecutive page screenshots from a document. Some of these pages may be Table of Contents (TOC) pages, while others may be regular body text, section dividers, blank pages, or other non-TOC content.
> **Your task has two parts:**
> ### Part 1: Classify each page — decide whether it is a TOC page or not.
> A page IS a TOC page when it shows a STRUCTURED LISTING of document sections, recognizable by MOST of these visual patterns:
> - Multiple entry lines, each pairing a section/chapter TITLE with a PAGE NUMBER
> - Leader characters (dots "......", dashes "------", or whitespace) connecting titles on the left to page numbers aligned on the right
> - Systematic numbering in the titles (1. / 1.1 / Chapter 1 / 一、 / 第一章, etc.)
> - An explicit heading such as "Table of Contents", "Contents", "目录", or "目次" (may appear only on the first page of a multi-page TOC)
> A page is NOT a TOC page when:
> - It contains narrative paragraphs or body text, even if the text has numbered headings (e.g. "1.0.1 为建立并落实..." followed by explanatory sentences)
> - It is a section divider / title page with only a single heading and no listing
> - It is blank or nearly blank
> - It shows data tables, charts, or images rather than a contents listing
> - It has numbered definitions or terms with explanations (e.g. "2.0.3 风险 risk") — these are glossary/body content, NOT a TOC
> The KEY distinction: TOC entries are SHORT titles pointing to page numbers. Body text has EXPLANATORY content after the heading. If a numbered item is followed by sentences of explanation, it is body text, not a TOC entry.
> ### Part 2: Extract entries from TOC pages only — for each page you classify as TOC, extract every entry with:
> - title: the section/chapter name, verbatim, without trailing dots or leaders. Combine wrapped lines into one string. Include numbering prefixes.
> - page_number: integer for plain numbers, string for non-numeric (iv, F-1), null when no page reference is visible.
> - level: hierarchy depth from visual cues (1=top-level, 2=indented sub-entry, 3+=deeper). Category headers or group labels without page numbers → level 1.
> Do NOT include the TOC heading itself ("Table of Contents", "目录", etc.) or column labels ("Page", "页码").

---

## Notes
- **Strict JSON** everywhere; no markdown fences; bounded by the retrieval wallet
  (visual budget ~800 tokens per screenshot; planner thinking budget; decomposition caps).
- **Local (non-LLM) tools** in the same flow: `aggregate.doc_stats`, page-feature bootstrap,
  `grep.text` (deterministic text search — no prompt), `validate.anatomy_map` (deterministic).
- The executor loop repeats until `verdict_now` / validation passes, bounded by step caps.
