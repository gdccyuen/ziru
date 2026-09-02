# Ziru WebUI Answer Presentation — Adoption Study & Plan

> Why this file exists: the legacy `knowhere-notebook` UI presents chat
> answers with a richer design (folded reference/statistics sections, a
> click-to-open chunk pane, inline reference links). This record documents
> (1) the root cause of the "Internal Server Error" observed when asking a
> question in the current Ziru WebUI, and (2) a study-and-plan for fully
> adopting the legacy answer presentation in `ziru/webui`.
>
> **Status: study + plan only. No implementation in this change.**

## 1. Symptom

Sending a question in the Ziru WebUI (thread "synth2") produced:

- no echo of the user's query in the thread,
- an "Internal Server Error" line instead of an answer,
- below it, the *previous* turn's source-chunk cards (stale citations).

The same query actually **succeeded server-side**: the assistant answer and
its citations were persisted to `chat_messages` (2026-09-02 13:21:33 UTC)
~8 seconds after the browser already saw the error. A page reload shows the
answer — the UI just never recovers or refetches on failure.

## 2. Root cause (diagnosed and reproduced)

### 2.1 The 30-second proxy cutoff

`ziru/webui` proxies every API call to the core API with a Next.js
`rewrites()` rule in `webui/next.config.ts`:

```ts
async rewrites() {
  return [{ source: "/api/:path*", destination: `${apiBaseUrl}/:path*` }];
}
```

Next.js applies a default **30 000 ms timeout** to rewritten/proxied requests:

- `webui/node_modules/next/dist/server/lib/router-utils/proxy-request.js:33`
  `proxyTimeout: proxyTimeout === null ? undefined : proxyTimeout || 30000`
- configurable via `experimental.proxyTimeout` (`next/dist/server/config-schema.js:295`, `config-shared.d.ts:393`)

Observed timeline for the failing turn (2026-09-02, all UTC):

| Time | Event |
|---|---|
| 13:20:55.825 | Browser `POST /api/v2/chat/threads/b57ecd1d…/messages` reaches core API; retrieval pipeline starts |
| 13:20:56.26 | Retrieval (top-k=8, recall-k=30) completes in ~0.4 s |
| 13:20:56.7 → 13:21:33.2 | Answer synthesis: one LLM call to `PROVIDER_URL=http://host.docker.internal:8888/v1` (Unsloth Studio backend) → llama-server; HTTP 200 after **36.6 s** |
| **13:21:25.81** | **Next.js proxy aborts the request — exactly 30.0 s after arrival** (`Failed to proxy http://api:5005/… ECONNRESET`, `socket hang up`) → browser gets HTTP 500 "Internal Server Error" |
| 13:21:33.13 | Core API persists assistant message + citations (answer completed 8 s after the proxy gave up) |

**Live reproduction** (probe through the real stack, fresh thread, minted
admin session): `POST …/messages` → `HTTP 500` body `Internal Server Error`
**after 30.019 s**; fetching the thread 5 s later already shows both the user
message and the completed assistant answer. Same `ECONNRESET` in the webui
log.

### 2.2 Why turns exceed 30 s: local 27B engine latency

`PROVIDER_URL` points the API container at the host's Unsloth Studio backend
(port 8888, token-authenticated), which relays to llama-server serving
`unsloth/Qwen3.8-27B-GGUF` (`Qwen3.8-27B-UD-Q4_K_XL.gguf`, Q4_K, 27.3B):

- llama-server flags (from process list): `-c 262144 --parallel 4
  --flash-attn on --no-context-shift --fit on --kv-unified --spec-type
  ngram-mod,draft-mtp --reasoning-budget 0`, chat template with
  `enable_thinking: true` → huge KV context (prompt-cache entries > 1 GiB,
  evictions under load), thinking enabled on every call.
- Measured latency (llama-server logs + backend request log):
  - idle single chat synthesis: **36.6 s** (this incident),
  - two concurrent calls at 13:40: 9,995-token prefill took **112.8 s**
    (88.6 tok/s), generation ~6 tok/s, one request total **152.7 s**
    (studio log `process_time_ms: 152747.82`),
  - probe during residual load: **56.8 s** for a 2k-token prompt / 150
    output tokens.

The Ziru side asks for a lot per turn: `chat_service._synthesize_answer_sync`
builds a system+5×1500-char evidence prompt and requests `max_tokens=8192`;
the Qwen3.8 reasoning template (`enable_thinking`) adds thinking tokens. The
API's own LLM client timeout is `OPENAI_CLIENT_TIMEOUT=300` s — 10× the
proxy's 30 s — so the proxy is always the first thing to break.

### 2.3 UI/UX aggravators (verified in code)

- `webui/src/app/(app)/chat/page.tsx` `handleSend`: appends the user message
  **only after the POST succeeds** (no optimistic echo) and only shows a
  thin generic error banner (`setError(err.message)` → HTTP 500 text) on
  failure; nothing refetches the thread afterwards, so a completed-but-late
  answer stays invisible until a manual reload.
- `webui/src/lib/api.ts`: plain `fetch`, no timeout, no streaming, no abort.

### 2.4 Fix direction (prerequisite, separate from this design plan)

1. `webui/next.config.ts`: set `experimental.proxyTimeout` to a large value
   (schema requires a positive number; e.g. `600_000` to match
   `OPENAI_CLIENT_TIMEOUT`). Note `0` would fall back to 30 000 — set it
   explicitly.
2. UI: optimistic user echo while `sending`; on error, refetch
   `GET …/messages` (the answer may exist server-side) before surfacing an
   error banner; show a human-readable "still working" state.
3. Engine-side (Unsloth Studio, outside this repo): smaller context or
   slot/prompt-cache tuning so a single turn reliably finishes in a bounded
   time; unrelated-but-notable: llama-server has restarted on a new port
   before (61265 → 56900), so `host.docker.internal:8888` indirection is the
   right stable seam (8888 proxies to the current llama port).

## 3. Legacy design spec (knowhere-notebook) — what "fully adopted" means

All file paths below are relative to `~/Documents/repos/knowhere-notebook`.

### 3.1 User-visible behaviors

1. **Inline reference links in the answer text.** The chat harness is
   instructed to emit `[Source N: label]` markers inside the answer
   (`fix(chat): instruct the harness to embed inline [Source N: label]
   citation markers`), and the message renderer anchors each marker to the
   N-th citation. Marker text is built from the citation label cascade
   (file name → slashed path → section label → description) in
   `src/components/chat-message-list.tsx` (~lines 511-518).
2. **Reference/statistics sections folded by default.** A reusable
   `CollapsibleSection` (`src/components/collapsible-section.tsx`) wraps
   both the retrieval trace and the sources area; each shows a badge
   (e.g. query count) and expands on click.
3. **Statistics block.** `src/components/chat-retrieval-trace.tsx` renders a
   "Retrieval" `CollapsibleSection` containing an answer-stats line —
   `durationSeconds · LLM call count · input/output tokens` — plus one row
   per retrieval sub-query: query text, result count ("N hits"), cited
   chunk count, top scores.
4. **Clicking a reference opens a chunk pane.** Reference/source entries
   open the chunks panel — a full-screen overlay with a Close button
   (`feat(chunks): move chunks pane to full-screen overlay with Close
   button`) that shows the source's parsed chunk tree (default-expanded
   root + 1 level, sections toggle on click), parsed chunk cards, and
   "original" previews (PDF/text/DOCX). Hover over a source chip shows a
   tooltip (`feat: Add source chip hover tooltip`); hovering a citation
   highlights it.
5. **Live progress during retrieval.** The chat route streams NDJSON
   progress events and the UI shows a live "Searching sources" progress
   line until the answer arrives (`feat(chat): live progress on the
   Searching sources line via NDJSON streaming`).
6. Citations resolve to page chunks by `chunkId` even when the snippet is a
   window (`feat(chat): page-targeted retrieval (dataType 7), chunkId
   citations`).

### 3.2 Data contracts (relevant subset of `src/domains/chat/types.ts`)

```ts
type RetrievalResultView = {
  content: string; chunkType: string; score: number | null;
  chunkId?: string; assetUrl?: string;
  source: { documentId?: string | null; sourceFileName?: string | null;
            sectionPath?: string | null };
}
type ChatMessageView = { id; role; content; citations?; artifacts?;
                         retrievalTrace? }
type RetrievalTraceView = { durationSeconds?; llmCallCount?; inputTokens?;
                            outputTokens?; queries: RetrievalTraceEntryView[] }
type RetrievalTraceEntryView = { query; namespace; resultCount;
                                 referencedChunkCount; topScores }
```

Legacy note: persisted citations deliberately exclude chunk text; Ziru
already persists full `content` in `chat_messages.citations`, which is an
advantage for a lightweight chunk pane.

## 4. Gap analysis — current `ziru/webui` vs legacy

| Capability | Legacy (knowhere-notebook) | Current (ziru/webui) |
|---|---|---|
| User echo while sending | streaming progress + bubbles | none until success (`page.tsx handleSend`) |
| Answer markdown | rich renderer + artifacts | `ReactMarkdown` + GFM only (`chat-message-list.tsx`) |
| Inline `[Source N: label]` links | anchored to citation ordinals | not emitted (prompt asks for section paths in parentheses) and not parsed |
| Citation block | folded sections, chips, hover, click → chunk pane | static "Sources" list, ≤ 5 cards, link to `/documents?document=` page, 2-line clamp, always expanded (`Citations` in `chat-message-list.tsx`) |
| Statistics / retrieval trace | "Retrieval" folded section: duration, LLM calls, tokens, per-query hits/scores | absent — `POST …/messages` response carries only the two message objects; nothing measures the turn |
| Chunk pane | full-screen overlay with parsed chunk tree + originals | none from chat (document viewer exists on the Documents page) |
| Streaming/progress | NDJSON "Searching sources" live line | single blocking POST; static `Searching your knowledge…` pulse while `sending` |
| Failure handling | — | generic banner; no refetch; answer may already exist server-side |

Backend anchors (all `ziru/core`):
- `apps/api/app/api/v2/routes/chat.py` — `POST /threads/{id}/messages` → `run_message_turn`.
- `apps/api/app/services/chat/chat_service.py` — retrieval (top_k 8 /
  recall_k 30, agentic off by default), `_synthesis_prompt` (evidence
  blocks, "reference sections by their paths in parentheses" — the string
  that should become the `[Source N: label]` protocol), `_synthesize_answer_sync`
  (sync LLM call via `asyncio.to_thread`, `max_tokens=8192`,
  `except Exception: pass` fallback to raw evidence text), message payload
  with `citations` (full retrieval results incl. `content`, `chunk_id`,
  `source{document_id, source_file_name, section_path}`).
- `packages/shared-python/shared/services/ai/` — OpenAI-compatible client,
  per-call `usage_task` labels, existing token-tracking infrastructure that
  can source input/output token counts.

## 5. Adoption plan (phased)

Recommended order; each phase is independently shippable. Frontend files
`ziru/webui/…`, backend files `ziru/core/…` unless noted.

### Phase 0 — Make the turn survive (prerequisite bug fix, separate change)
- `webui/next.config.ts`: `experimental.proxyTimeout` → large value.
- `webui/src/app/(app)/chat/page.tsx`: optimistic user echo; on POST error,
  refetch messages before showing the banner.
- Acceptance: a > 30 s turn completes in the UI and the answer appears
  without reload.

### Phase 1 — Data contract: turn trace + marker protocol
- Backend: in `run_message_turn`, measure `durationSeconds`; capture
  synthesis `input/output tokens` (LLM client usage; existing usage/token
  tracking), retrieval sub-query rows (already logged; reuse) → return a
  `trace` object alongside `user_message`/`assistant_message` (transient,
  like legacy; persistence decision in §6).
- Backend: change `_synthesis_prompt` to instruct the model to cite as
  `[Source N: label]` matching evidence-block ordinals (label =
  section_path/file name), replacing the free-form "paths in parentheses".
- Webui: extend `ChatMessage`-adjacent types + `api.ts` response type with
  `retrievalTrace` (mirror `RetrievalTraceView`).
- Tests: backend unit tests for marker instruction + trace fields; api.test.ts updates.

### Phase 2 — Static rendering port
- New `webui/src/components/collapsible-section.tsx` (title, icon, badge,
  folded by default) — port of legacy primitive.
- New `webui/src/components/chat-retrieval-trace.tsx` equivalent: folded
  "Retrieval" section with the stats line and per-query rows (uses Phase 1
  trace payload).
- `chat-message-list.tsx`:
  - number citations deterministically and render them as a folded
    "Sources (N)" section (default collapsed) of compact rows (ordinal,
    file/section label, small snippet) instead of the always-open card grid;
  - render answer markdown with `react-markdown` components that detect
    `[Source N: label]` and anchor/underline them, hover → highlight the
    matching citation row, click → open the chunk pane (Phase 3);
  - keep the document-page deep link on the source label.
- Tests: component tests for marker anchoring and folded defaults (repo has
  vitest + playwright scaffolding).

### Phase 3 — Chunk pane (lightweight first)
- New full-screen overlay component from chat (legacy `chunks-panel.tsx`
  pattern): close button, source header, chunk list.
- Data source: persisted citation `content` (already in Ziru — no extra
  fetch needed for the snippet view). Where richer detail exists
  (documents page viewer / chunk APIs), deep-link or lazy-load; full parsed
  section-tree inside the pane is optional and depends on §6.
- Wire: chat reference click → pane; pane open from the "Sources (N)"
  section rows too.

### Phase 4 (optional, larger) — Live progress streaming
- Decide single-shot vs NDJSON stream (see §6). If streamed: new chat
  stream route (or SSE) emitting retrieval phase events; UI "Searching
  sources" line; requires keeping the current sync turn contract for
  compatibility or versioning the endpoint (chat v3). Recommend deferring
  until Phases 0-3 are proven.

### Phase 5 (optional) — Artifacts & history polish
- Table/image artifact cards in answers (legacy `ChatArtifactView`) — only
  if the corpus/parse pipeline exposes assets to chat context; verify
  `document_chunks`/asset plumbing first.
- Persist compact traces on `chat_messages` (new column / JSONB, alembic
  migration) so history shows the folded Retrieval section too (legacy
  keeps traces client-side/transient only).

## 6. Decisions needed

1. **Streaming now or later?** Recommendation: keep the single-shot POST
   (sync turn already fits; add trace payload + optimistic echo + proxy
   fix), add NDJSON streaming in a later phase.
2. **Marker protocol**: adopt legacy `[Source N: label]` verbatim (parseable,
   proven, matches user's "inline reference links")? Any Ziru-specific
   label rule (e.g. prefer `section_path`)?
3. **Trace persistence** (Phase 5) vs transient (legacy behavior)?
4. **Chunk pane depth**: snippet-only from persisted citations, or full
   parsed section tree + original previews wired to Ziru document/chunk
   APIs? (Determines Phase 3 scope.)
5. **Statistics granularity**: turn-level only, or also per retrieval
   sub-query rows (needs agentic workflow instrumentation when agentic is
   on)?

## 7. References / evidence

- Next.js proxy timeout: `ziru/webui/node_modules/next/dist/server/lib/router-utils/proxy-request.js:33`; schema `config-schema.js:295`.
- Incident logs: webui container `Failed to proxy … messages … ECONNRESET`
  at 2026-09-02T13:21:25.811Z; Unsloth backend log
  `~/.unsloth/studio/logs/backend-backend-*.log` (`request_completed` POST
  `/v1/chat/completions` 200, `process_time_ms 36557` and `152747`); core
  API log retrieval pipeline at 13:20:55; `chat_messages` rows persisted
  13:21:33.
- Reproductions: synthetic probe HTTP 500 at 30.019 s with messages
  persisted by +35 s; synthesis-style call measured 56.8 s under load.
- Legacy behaviors: `knowhere-notebook` commits `46cd854`, `ae514fe`,
  `2e2c1a5`, `ce55e23`, `a74e143`, `e23ccf9`, `f4cb5bb`, `82ba366`,
  `e542b99`; components listed in §3.
