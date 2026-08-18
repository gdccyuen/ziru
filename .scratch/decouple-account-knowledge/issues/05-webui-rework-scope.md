# 05 — WebUI Rework Scope

Type: grilling
Status: open
Blocked by: —

## Question

How does the WebUI change?

- Identity: authenticate against the core API's single identity store; remove the local users table and the dashboard-SSO bridge.
- Workspaces → filtered views: default search scope = own profile, shrink-only; what happens to the workspace switcher, the namespace dropdown, and eager document localization.
- Upload gating by grade (librarian/admin only; attribute values chosen from the uploader's own profile).
- API key management UX (any account creates keys).
- Job/document monitoring surfaces.
- What stays exactly as it is today (chat UI, sources/chunks panels).
