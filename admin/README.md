# Ziru Admin Console

The management console for [Ziru](https://github.com/gdccyuen/ziru), a
self-hosted on-premise knowledge engine. It is a **stateless Next.js app**
that talks to the Ziru core API through an `/api` rewrite proxy — it has no
application database of its own. Sessions come from the core
(`POST /v1/auth/login`, HttpOnly cookie `ziru_session`); the edge proxy
redirects unauthenticated requests to `/login`.

## Pages

- **Overview** — core health/version, document/attribute/job counts, recent jobs
- **Users** — admin-only: create all grades, set profiles, disable, reset password, SSO pre-link
- **API Keys** — admins see/create/revoke keys for any user; non-admins see their own keys (read-only)
- **Attributes** — attribute dictionary (admin mutations; deleting an in-use key returns 409); read for all
- **Documents** — filters, upload (admin/librarian), view original file, archive (admin-only)
- **Jobs** — processing jobs
- **Webhooks** — outbound webhook configuration and delivery logs
- **Settings** — read-only

## Run

Prereqs: Node 22, pnpm 10, and a running core API (port 5005).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

The app proxies `/api/*` to the core at `NEXT_PUBLIC_API_URL` (default
`http://localhost:5005/api`). For self-hosted deployment use the combined
stack in `deploy/`.

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Core API base URL, e.g. `http://localhost:5005/api`. |
| `NEXT_PUBLIC_APP_URL` | Public console URL, e.g. `http://localhost:3000` (used for login redirects). |

Do not commit `.env.local` or any other real environment file.

## Quality

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

## Acknowledgements

Ziru Admin Console is part of [Ziru](https://github.com/gdccyuen/ziru), a fork
of [Knowhere](https://github.com/Ontos-AI/knowhere) by Ontos-AI, distributed
under the Apache License 2.0. The upstream attribution notice is preserved in
`NOTICE` (this directory) and in the root [NOTICE](../NOTICE).
