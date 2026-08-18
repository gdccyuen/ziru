# 05 — WebUI Rework Scope

Type: grilling
Status: resolved
Resolved: 2026-08-18 (grilling session with PM, Q29–Q34)
Blocked by: —

## Question

How does the WebUI change?

## Answer

Resolved with the PM (Q29–Q34):

- **Identity (Q29):** WebUI login = username/password checked by the core API + SSO buttons served by core's providers. All local identity machinery deleted: users table, local sessions, Google/GitHub OAuth, dashboard-SSO bridge.
- **Self-service (Q30):** dashboard stays admin-only; the WebUI gains a small **Account settings** page — change own password + manage own API keys (repurpose the existing API-keys dialog against core's /v2/api-keys).
- **Sources panel (Q31):** becomes a filtered document view — `GET /v2/documents`, default = whole profile scope, attribute-filter chips (dictionary-driven, shrink-only), profile scope shown as a fixed banner. Workspace switcher, members dialog, namespace dropdown/localization, and the workspace cookie are removed. The **active filter bag is the chat retrieval scope** (∩ profile).
- **Upload (Q32):** visible to librarian/admin only. Attribute picker from the dictionary — **admin: any values; librarian: values from their own profile PLUS other dictionary attributes for extra specificity** (note: whoever's profile matches the tagged attributes can see the document — that's the fail-closed attribute model). Upload progress inline from the job id; monitoring stays in the dashboard (Q11).
- **Unchanged (Q33):** chat threads/panel, citations, chunks overlay, rerank/recall-K/top-K toggles, prompt templates, retrieval trace.
- **Chat history (Q34):** stays in the WebUI's own database, **per user** (threads store the filter bag they were created with); explicit thread management: switch between threads, create new, delete (soft-delete per repo convention). WebUI DB shrinks to chat history only.

- Identity: authenticate against the core API's single identity store; remove the local users table and the dashboard-SSO bridge.
- Workspaces → filtered views: default search scope = own profile, shrink-only; what happens to the workspace switcher, the namespace dropdown, and eager document localization.
- Upload gating by grade (librarian/admin only; attribute values chosen from the uploader's own profile).
- API key management UX (any account creates keys).
- Job/document monitoring surfaces.
- What stays exactly as it is today (chat UI, sources/chunks panels).
