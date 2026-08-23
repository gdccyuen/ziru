# Ziru WebUI Domain Context

The Ziru WebUI is the stateless end-user app for searching and chatting
against the shared Ziru knowledge engine. This file names the product
concepts; implementation detail lives in `AGENTS.md` and `core/CONTEXT.md`.

## Core Terms

### User

An account in the core identity store. The WebUI never creates users — an
administrator provisions them in the admin console.

### Grade

The account role — `administrator`, `librarian`, or `user` — that decides what
the account can do.

### Profile

The account's attribute constraints (a list of `{key, values}` rules) that
bound which Knowledge Objects the account can see. An empty profile sees
nothing (fail-closed); administrators bypass profile evaluation.

### Knowledge Object

A global document: no owner and no namespace. It carries attributes plus
system-set built-ins (`createBy`, `createTime`, `fileHash`, `originalFile`).
_Avoid_: workspace, source, namespace (pre-fork concepts)

### Attribute

A key/value tag on a Knowledge Object, or a rule inside a Profile.

### Attribute Dictionary

The admin-managed set of attribute keys with optional allowed values.
Uploaders pick from it when tagging Knowledge Objects, and Profiles are built
from the same keys.

### Search Query

A user's evidence search: query text plus attribute filters and tuning
(topK, recallK, rerank).

### Evidence Answer

The retrieval engine's response: ranked, cited evidence with citations — never
free-form LLM prose.
_Avoid_: answer, response (when meaning synthesized text)

### Citation

Metadata connecting an Evidence Answer to a specific retrieval result or chunk.

### Chat Thread

A per-user conversation of turns — a user message plus the persisted Evidence
Answer — stored by the core API.

### Session

The login state carried by the `ziru_session` cookie; enforced by the core API
on every request.

### API Key

An `sk_`-prefixed credential, created by an administrator for a user. The
WebUI shows a user their own keys read-only.

## Explicitly out of scope

- No billing, credits, tiers, guest accounts, or telemetry.
- No local database — all state lives in the core API.
- No free-form LLM answer generation, streaming, or SSE.
