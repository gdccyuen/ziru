# ADR 0009: Multi-domain workspaces with file-backed API keys

**Date:** 2026-08-02

## Status

Accepted

## Context

The WebUI previously bound one user to exactly one workspace (`user_id`
unique), with a single global Ziru API key from `ZIRU_API_KEY`. For
self-hosted deployments where a Ziru instance (or dashboard) has several
users, each with their own document domains, the operator needed one WebUI
deployment that can switch between document domains quickly, without
restarting the container.

Requirements gathered from the operator:

1. Each API key points to a different document domain (namespace set).
2. Switching domains must be fast and require no container restart.
3. Each workspace maps to a **namespace under a domain** — not to a domain
   itself (many workspaces may share one API key, one per namespace).
4. The domain switcher lives at the top of the sources panel.
5. Legacy single-workspace rows (`ziru-<uuid>`, no key label) keep
   working unchanged.

## Decision

1. **Workspace model:** `workspaces` becomes one row per
   `(userId, ziruKeyLabel, namespace)` tuple. The `user_id` and
   `namespace` uniqueness constraints are dropped; a composite unique index
   `(user_id, ziru_key_label, namespace)` replaces them. A null key label
   means "default key" (legacy behavior).
2. **Key source:** `config/ziru-keys.json` — an array of
   `{ label, apiKey }`. Read server-side per request with an mtime cache, so
   editing the file takes effect without a restart. Falls back to
   `ZIRU_API_KEY` env as a single `"default"` key when the file is absent.
3. **Active workspace:** the `ziru-ws` cookie holds the active workspace
   id (not a secret). `ensureWorkspace` resolves it on every request: cookie
   → first workspace → legacy default creation.
4. **Credential resolution:** `ensureApiKeyForWorkspace` looks up the
   workspace row, resolves its `ziruKeyLabel` from the key source, then
   falls back to the default key, then the env override, then the Dashboard
   JWT (production path unchanged).
5. **API:** `GET /api/ziru-keys` (masked labels), `GET
   /api/ziru-keys/[label]/namespaces`, `POST /api/workspaces/activate`,
   `POST /api/workspaces` (`{ keyLabel, namespace }`).
6. **UI:** a `WorkspaceSwitcher` at the top of the sources panel, grouped by
   domain, with a "New workspace…" dialog that picks a domain key, fetches its
   namespaces, and creates the workspace for the chosen namespace.

## Consequences

- New workspaces pick an existing Ziru namespace (never auto-generate a
  `ziru-<uuid>` for multi-domain setups).
- Keys live in a host file (operator-controlled secrets, world-readable for
  the container), not in Postgres. Phase 3 will move them to encrypted DB
  rows.
- The Dashboard production path (JWT issuance) is untouched; the file-backed
  keys only apply in dev/self-hosted mode.
- Future phases: WebUI-owned auth (Phase 2) and DB-backed encrypted keys
  (Phase 3) build on this model — the workspace `(user, keyLabel, namespace)`
  binding and the cookie-tracked active workspace carry forward unchanged.
