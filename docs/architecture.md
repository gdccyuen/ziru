# Architecture — Ziru vs Knowhere

A side-by-side view of the components and the document–knowledge–user
relationships, before and after the fork. The two diagrams share the same
skeleton (People → Frontends → Engine → Knowledge) so the changes are easy to
spot.

## The one-sentence difference

- **Knowhere** — *every account keeps its own private corner* (each document
  is tied to a `user_id` + `namespace`), wrapped in SaaS machinery (billing,
  credits, guest tier, telemetry), spread across several repositories.
- **Ziru** — *one shared library everyone reads from*, governed by *who you
  are* (grade + profile) instead of *what you own*, in one monorepo, with the
  SaaS machinery removed.

## Ziru

```mermaid
flowchart TB
  subgraph Z["ZIRU — one monorepo"]
    direction TB
    subgraph PEOPLE["People (grades)"]
      ADMIN["Administrator"]
      LIBRARIAN["Librarian"]
      USER["User"]
    end
    subgraph FRONTENDS["Frontends"]
      CONSOLE["Admin console (admin/)<br/>provision users · grades · profiles · API keys · attribute dictionary"]
      WEBUI["WebUI (webui/) — stateless<br/>search + evidence chat · proxy to API"]
    end
    subgraph ENGINE["Knowledge engine (core/)"]
      API["FastAPI :5005"]
      WORKER["Celery worker — parse documents"]
      RETRIEVAL["Retrieval — BM25 3-channel + agentic<br/>(frozen: same as Knowhere)"]
    end
    KNOWLEDGE["Knowledge Objects — GLOBAL<br/>no owner · no namespace<br/>attributes + createBy / createTime"]
    STORE[("PostgreSQL · S3 · Redis")]
    CONSOLE --> ADMIN
    ADMIN -->|provisions| LIBRARIAN
    ADMIN -->|provisions| USER
    WEBUI --> API
    API --> WORKER --> RETRIEVAL
    RETRIEVAL --> KNOWLEDGE
    KNOWLEDGE --> STORE
    ADMIN -.->|sees all — bypasses profile| KNOWLEDGE
    LIBRARIAN -.->|sees what profile allows| KNOWLEDGE
    USER -.->|sees what profile allows — fail-closed| KNOWLEDGE
  end
```

## Knowhere

```mermaid
flowchart TB
  subgraph K["KNOWHERE — multiple repos (Ontos-AI)"]
    direction TB
    subgraph PEOPLE["People"]
      OWNER["Account (API-key owner)"]
      GUEST["Guest (restricted tier)"]
    end
    subgraph REPOS["Repositories"]
      DASHBOARD["knowhere-dashboard<br/>API keys · billing · webhooks"]
      NOTEBOOK["knowhere-notebook<br/>upload · explore · LLM answers"]
      SDK["knowhere-python-sdk · knowhere-node-sdk"]
      SELFHOST["knowhere-self-hosted (compose)"]
    end
    subgraph ENGINE["Engine (knowhere repo)"]
      API2["FastAPI :5005"]
      WORKER2["Celery worker"]
      RETRIEVAL2["Retrieval — BM25 3-channel + agentic"]
    end
    KNOWLEDGE2["Document — OWNED<br/>user_id + namespace (per-user silo)"]
    STORE2[("PostgreSQL · S3 · Redis · ~/.knowhere")]
    DASHBOARD --> OWNER
    DASHBOARD --> GUEST
    NOTEBOOK -->|workspace binds user + namespace| KNOWLEDGE2
    SDK --> API2
    NOTEBOOK --> API2
    API2 --> WORKER2 --> RETRIEVAL2
    RETRIEVAL2 --> KNOWLEDGE2
    KNOWLEDGE2 --> STORE2
    OWNER -.->|sees own documents only| KNOWLEDGE2
    GUEST -.->|restricted route surface| KNOWLEDGE2
  end
```

## Side-by-side comparison

| Concept | Knowhere | Ziru |
|---|---|---|
| Repositories | 5+ separate repos | 1 monorepo |
| Who owns a document | a user + a namespace | nobody — global knowledge object |
| Access control | owner sees own docs | grade + profile, fail-closed |
| Chat output | LLM synthesizes answers | evidence + citations only |
| SaaS surface | billing, credits, guest, telemetry | none |
| Cache scope | per (user, namespace) | global |
| Frontends | dashboard + notebook + SDKs | admin console + stateless webui |
| Document tags | namespace string | attribute dictionary (typed keys) |

## What stayed the same

The **engine is frozen** — the document parser and the retrieval core
(BM25 3-channel RRF + agentic navigation) are unchanged from Knowhere. The
fork changes *organization and access*, not *how documents are understood*.

## Rendering

- `architecture.md` (this file) renders the Mermaid diagrams on GitHub.
- `architecture-ziru.png` and `architecture-knowhere.png` are exported images
  of the two diagrams (generated from `architecture-ziru.mmd` /
  `architecture-knowhere.mmd`) for slides and documents.
