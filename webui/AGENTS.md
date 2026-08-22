<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing or modifying any
Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first. In the final response,
name the guide topics you consulted when Effect code changed.

For browser and server HTTP calls in app code, prefer the established
Effect/@effect/platform pattern (`HttpClientRequest`, `HttpClient`,
`FetchHttpClient`) or an existing local wrapper. Do not introduce direct
component-level `fetch` calls unless there is a specific API limitation, and
document that limitation before coding.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

<!-- effect-solutions:end -->

## What this app is

The Ziru WebUI is a **stateless** Next.js end-user app (port 3001) for Ziru, a
self-hosted on-premise knowledge engine. Every piece of state — sessions,
users, documents, attributes, API keys, chat threads — lives in the **core
API** (FastAPI, port 5005). The WebUI has **no local database**, no Better
Auth, and no workspaces/namespaces. All requests are plain fetch calls through
the Next.js rewrite proxy.

## Product model (single source of truth)

- **Knowledge objects are global** — no owner, no namespace. They carry
  attributes (`attribute_dictionary` keys + allowed values); documents add
  immutable built-ins `createBy`, `createTime`, `fileHash` (sha256), and
  `originalFile` (retained original bytes, downloadable via
  `GET /v2/documents/{id}/file/original`).
- **Access control** — the `users` table has grades
  `administrator` / `librarian` / `user` and a profile (list of
  `{key, values}`). Profiles are **fail-closed**: an empty profile sees
  nothing; administrators bypass profile evaluation.
- **Identity** — login is `POST /v1/auth/login` (HttpOnly cookie
  `ziru_session`); forced password change is enforced by the core
  (`403 PASSWORD_CHANGE_REQUIRED`). API keys are `sk_`-prefixed,
  admin-created per user. SSO is OIDC, admin pre-link only.
- **No billing/credits/tiers/guest/telemetry** — do not reintroduce any of it.
- **Engine is frozen** — BM25 3-channel RRF + agentic retrieval;
  chat is **evidence-based**: persisted answers come from the retrieval
  engine with citations only. **No free-form LLM answer generation, no SSE,
  no streaming** in the WebUI.

## Core API surface the WebUI calls

Every request goes through `/api/*` (rewrite proxy) and carries the
same-origin `ziru_session` cookie automatically. `src/lib/api.ts`
(`apiRequest`) is the single typed client — extend it rather than calling
`fetch` directly.

| Area | Endpoints |
|---|---|
| Auth | `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me`, `POST /v1/auth/change-password` |
| Search | `POST /v2/search` (query + attribute filters + topK/recallK/rerank) |
| Documents | `GET /v2/documents` (filters + pagination), `GET /v2/documents/{id}/file/original` |
| Chat | `/v2/chat/threads` (list/create/rename/archive) + `/v2/chat/threads/{id}/messages` (list/post) |
| Attributes | `GET /v2/attributes` (dictionary read) |
| API keys | `GET /v2/api-keys` (own keys, read-only) |

## Architecture

```
src/
  app/              Next.js App Router pages
    login/          login form (core session)
    force-change-password/  forced password change
    (app)/          authenticated shell (AppShell + AuthProvider)
      page.tsx      redirects / → /chat
      search/       attribute chips + evidence search results
      documents/    browse documents, filters, view original file
      chat/         per-user threads + message turns
      settings/     profile (read-only), change password, own API keys (read-only)
  components/       React components + shadcn/ui primitives
  lib/              api.ts (core client), auth-context.tsx, format.ts, utils.ts
```

- **Proxy:** `next.config.ts` rewrites `/api/:path*` →
  `${NEXT_PUBLIC_API_URL}/:path*` (default `http://127.0.0.1:5005/api`);
  `src/proxy.ts` is the edge proxy that short-circuits anonymous requests to
  `/login` (real auth is enforced by the core API on every call).
- **Auth:** `AuthProvider` (`src/lib/auth-context.tsx`) loads
  `GET /v1/auth/me`; `401` → `/login`, `403` with code
  `PASSWORD_CHANGE_REQUIRED` → `/force-change-password`. `AppShell`
  (client-side) guards the authenticated area and shows the account menu
  with grade/profile badge.
- **Chat:** `ChatPage` lists threads, loads messages per thread, and posts
  turns through `api.chatThreads.*`; the core persists the user message and
  the evidence answer with citations. No streaming.

## Conventions

- **Evidence-first chat:** assistant messages are the core's persisted
  evidence answer plus `citations` (RetrievalResult[]). Never synthesize
  free-form LLM output on the client, and never add SSE/streaming.
- **No local DB:** there is no Drizzle schema, no migrations, no
  `TEST_DATABASE_URL`-gated integration tests for this app. Keep it stateless.
- **API calls:** use `src/lib/api.ts` (`apiRequest`) everywhere; it returns
  typed JSON and throws `ApiError` with `status`/`code`. Server-only modules
  may import `server-only` (vitest stubs it).
- **UI:** shadcn/ui + Tailwind CSS 4 + lucide-react; match the admin
  console's design language. Semantic Tailwind colors only.
- **Tests:** vitest, node environment, `src/**/*.test.ts`; e2e via Playwright
  (`pnpm test:e2e`).

## How to run

- **Core API:** `cd core/apps/api && uv run uvicorn app.main:app --port 5005`
  (or the `deploy/` compose stack) — port **5005**.
- **Admin console:** `cd admin && pnpm dev` — port **3000**.
- **WebUI:** `cd webui && pnpm install && pnpm dev` — port **3001**.
  Default `NEXT_PUBLIC_API_URL` already points at
  `http://127.0.0.1:5005/api`.
- **Accounts/grades:** the core bootstraps an administrator (forced password
  change on first login); administrators create librarian/user accounts and
  API keys in the admin console. The WebUI never provisions users.

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
`pnpm build`.

CI runs: `lint → typecheck → test → build` on PRs to `main` and `staging`.