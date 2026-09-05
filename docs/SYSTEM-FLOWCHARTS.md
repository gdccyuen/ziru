# Ziru System Flowcharts (fresh-review edition)

Plain-English overview of the two main journeys: **how a document gets into the
system** and **what happens when someone asks a question**. Every acronym is
explained in the glossary at the bottom. Diagrams use Mermaid (renders on GitHub).

## Flow 1 — Document intake (how a PDF becomes searchable knowledge)

```mermaid
flowchart TD
    A[Librarian uploads a file in the Admin console] --> B{Validation}
    B -- missing file / bad type / too many at once --> B1[Rejected with message]
    B -- OK, attributes attached division, doc-type, etc. --> C[Job created + queued]
    C --> D[Celery worker picks up the job]
    D --> E[Local MinerU parse: PDF to text/tables/OCR - runs on this machine only]
    E --> F[Chunking: split into small searchable pieces text, table, image, page]
    F --> G[Build section tree: document outline chapters to paragraphs]
    G --> H[Local LLM writes short summaries per document/section - used later for routing]
    H --> I[Store chunks + KV attributes; built-in tags creator, time, file hash are locked]
    I --> J{Success?}
    J -- yes --> K[Status active: searchable + chat-ready]
    J -- no --> L[Retry / error log; uploader sees the job failed]
```

**Plain-English walk-through:** a librarian uploads a security-standard PDF, tags it
with labels such as `division`, a background worker parses it locally into text and
tables, splits it into paragraph-sized searchable units, records the document's
outline, and asks the local AI to write short summaries. Only then does it become
visible to search and chat. Nothing is sent to any cloud service.

## Flow 2 — Retrieval (what happens when a query is entered)

```mermaid
flowchart TD
    A[User types a question in Chat or Search] --> B[Normalise query: fix spellings e.g. wifi to wi-fi]
    B --> C[Resolve scope: caller profile + filters decide which documents may be seen]
    C --> D{Cached same question already?}
    D -- yes --> D1[Return cached answer quickly]
    D -- no --> E{Corpus tiny? chunks <= top-k}
    E -- yes --> E1[Small-corpus shortcut: return all chunks - no AI calls]
    E -- no --> F{Agentic ON? the default}
    F -- no --> G[Classic path: keyword search on 3 angles path, content, terms]
    G --> G1[Merge the 3 lists with RRF scoring]
    G1 --> H[Take top-k results and show evidence]
    F -- yes --> I[Agentic path: AI decides which documents to open]
    I --> J[Step 1 - LLM document selection over the knowledge map]
    J --> K{Selected any?}
    K -- no --> L[Step 2 - one auto-broadened retry: AI rephrases the question wider]
    L --> M{Selected any?}
    M -- no --> N{Relevance gate: are the keyword scores meaningful?}
    N -- no --> N1[Clean answer: no relevant documents found - no wasted minutes]
    N -- yes --> O[Step 3 - BM25 fallback: take top-3 keyword documents]
    K -- yes --> P[Open selected documents one by one]
    M -- yes --> P
    O --> P
    P --> Q[AI navigates each document: expand sections, collect the answering parts]
    Q --> Q1[Early stop if a fallback document already produced evidence]
    Q1 --> R[Hydrate evidence: pull the real chunks into context]
    R --> S[Assemble citations + evidence]
    S --> T{Is this a Chat question?}
    T -- yes --> U[Answer synthesis: one final AI call writes the readable answer with source numbers]
    T -- no --> V[Search results page shows evidence and sources]
    U --> W[Return answer + citations + trace]
    V --> W
```

**Plain-English walk-through:** the question is cleaned up, limited to documents the
user may see, and checked against a cache. Tiny corpora skip straight to an answer.
For normal corpora, the classic path is plain keyword search; the agentic path (the
default) lets the AI first *choose* documents — retrying once with a broader wording
if it picks nothing, and only then trusting the keyword list (guarded by a relevance
check so unrelated questions end quickly and honestly). Chosen documents are then
read section by section until the answering parts are collected, and chat writes a
final readable answer with numbered sources. Token/time budgets cap how much AI work
a single question can consume.

## Glossary (plain English)

| Term | What it means here |
|---|---|
| **API** | The program interface the web screens talk to |
| **Agentic** | AI-driven search: the LLM plans, chooses documents, and browses them step by step |
| **BM25** | A standard keyword-scoring formula used by the search engine (frozen, unchanged) |
| **Celery** | The background worker that processes uploads in the queue |
| **Chunk** | A small searchable piece of a document: a paragraph, table, image, or whole page |
| **KV attributes** | Labels stored as key-value pairs, e.g. `division=ssd`, used for filtering and profiles |
| **KG / Knowledge map** | A summary map of all documents (name + short summary + stats) that the AI reads to choose documents |
| **LLM** | Large Language Model — here the local Qwen model running on this machine via Unsloth |
| **MinerU** | The local PDF→text/table/OCR parser (no cloud, no API key) |
| **OCR** | Turning scanned images of text into real text |
| **P1 ladder** | The 3-step document-selection fallback: original AI pick → broader re-ask → keyword fallback |
| **Profile scope** | Which documents a user may see, derived from their account profile labels |
| **Redis** | Fast local cache/message store used for jobs, sessions and query caching |
| **Rerank** | A switch that is currently stored but not yet active in the engine |
| **RRF** | A simple method to merge several keyword result lists into one ranked list |
| **Section tree** | The document's outline: chapters → sections → paragraphs, used for navigation |
| **Top-k** | How many final results to return (default 8, adjustable up to 50) |
