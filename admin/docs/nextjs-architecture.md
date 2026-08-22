# Admin Console Architecture

This document describes the current architecture of the Ziru Admin Console
(`admin/`). It is a **stateless Next.js application**: it owns no database,
no auth tables, and no background jobs. All product state and identity live in
the Ziru core API (`core/`).

## Request flow

1. The browser loads the console (Next.js App Router, port 3000).
2. The edge `proxy.ts` checks for the `ziru_session` cookie on protected
   paths (`/`, `/users`, `/api-keys`, `/attributes`, `/documents`, `/jobs`,
   `/webhooks`, `/settings`) and redirects to `/login?callback=…` when
   absent.
3. Client pages call the core through the Next.js rewrite: `next.config.js`
   maps `/api/:path*` → `NEXT_PUBLIC_API_URL` + `/:path*` (default
   `http://localhost:5005/api`). The same-origin `ziru_session` cookie is
   forwarded automatically.
4. `lib/api.ts` is the single typed core client (`apiRequest`);
   `lib/auth-context.tsx` boots from `GET /v1/auth/me` and treats `401` as
   logged-out.

## Pages and role gating

- **Overview** (`/`) — health/version/counts for all signed-in users.
- **Users** (`/users`) — **admin-only** (nav item and route are hidden/blocked
  for non-admins): create all grades, edit profiles, disable, reset password,
  SSO pre-link.
- **API Keys** (`/api-keys`) — admins: all keys + create/revoke any;
  non-admins: own keys, read-only.
- **Attributes** (`/attributes`) — dictionary read for all; mutations
  (create/update/delete) admin-only; deleting an in-use key is blocked (409).
- **Documents** (`/documents`) — filters, upload (administrator/librarian),
  view original file, archive (admin-only).
- **Jobs** (`/jobs`) — processing jobs.
- **Webhooks** (`/webhooks`) — outbound webhook config and delivery logs.
- **Settings** (`/settings`) — read-only.

## Conventions

- No direct `fetch` in pages — route through `lib/api.ts`.
- No local persistence — do not add Drizzle schemas, cookies as state, or a
  database to the console.
- shadcn/ui + Tailwind CSS; shared design language with the WebUI
  (`webui/`).
- Tests are stateless Vitest unit tests (`pnpm test`); CI runs lint,
  type-check, test, and build.
