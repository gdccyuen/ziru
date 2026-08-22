# Ziru WebUI

The end-user web app for [Ziru](https://github.com/gdccyuen/ziru), a
self-hosted on-premise knowledge engine. Sign in, search the global knowledge
corpus with attribute filters, browse documents, and chat with per-user
threads backed by the engine's evidence-based retrieval.

The WebUI is **stateless**: it talks to the Ziru core API
([core](../core/README.md)) over an `/api` rewrite proxy and keeps no local
database. Sessions, documents, attributes, API keys, and chat threads all live
in the core.

## Stack

- Next.js 16 (App Router, port 3001) + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui + lucide-react
- Core API client in [src/lib/api.ts](src/lib/api.ts)
- Tests: Vitest (unit) + Playwright (e2e)

## Run

Prereqs: Node 22, pnpm 10, and a running core API (see
[core/README.md](../core/README.md) — or bring up the whole stack with
`deploy/`).

```bash
pnpm install
pnpm dev          # http://localhost:3001
```

The dev server proxies `/api/*` to the core at `NEXT_PUBLIC_API_URL`
(default `http://127.0.0.1:5005/api`). The admin console runs separately on
port 3000 (`cd admin && pnpm dev`).

## Accounts & grades

Accounts live in the core. The core bootstraps an **administrator** on first
start (password change forced at first login); administrators create
**librarian** and **user** accounts and API keys from the admin console.

- Grades: `administrator` / `librarian` / `user`
- Profiles: each account has a `{key, values}` profile that scopes what it
  can see — an empty profile sees nothing (fail-closed); administrators see
  everything.
- The WebUI never provisions users or API keys; Settings shows your profile
  and your own keys (read-only) and lets you change your password.

## Quality

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Acknowledgements

Ziru WebUI is part of [Ziru](https://github.com/gdccyuen/ziru), a fork of
[Knowhere](https://github.com/Ontos-AI/knowhere) by Ontos-AI, distributed
under the Apache License 2.0. See the root [NOTICE](../NOTICE) for the
upstream attribution notices.
