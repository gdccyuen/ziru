# 02 — Account Domain Design

Type: grilling
Status: claimed
Claimed by: agent (charting session, 2026-08-18)
Blocked by: —

## Question

Design the account domain around the settled direction (Q3, Q9, Q10):

- User model and the exact permission matrix for the three grades: administrator / librarian / user (upload, search scope, attribute editing, delete, create users, manage API keys).
- Bootstrap flow: initial admin creation with default password `P@ss202607` and forced change on first login; where it lives (core script vs dashboard page).
- Profiles: who sets a user's profile, can it change over time, and what happens to that user's API keys when it does (live binding, Q10).
- API keys: any account can create one; key inherits the account's live profile; lifecycle (list, revoke, rotate, masked display).
- Single identity store in core: session/auth flows for both the dashboard and the WebUI; password reset; account disable.
- External SSO seam (Q9): design the plug-in point now; the concrete protocol (e.g. AD/LDAP vs OIDC) is chosen after ticket 03's research lands.

## Progress — Q22–Q27 answered (2026-08-18)

- **Q22 — Permissions:** matrix as recommended, with one librarian extension: librarians may **change profiles (shrink-only, from their own)**, **change grades (between librarian and user only)**, **disable**, and **reset passwords** for the user-grade accounts they created. Admin remains the only authority for administrator-grade accounts and for widening profiles.
- **Q23 — Bootstrap:** as recommended — admin auto-created on empty DB (password `P@ss202607`, env-overridable), "must change password" enforced by the API on first login (only change-password + logout allowed until done). Password rules come from a **configurable password-policy module** (richer controls: length, capitalization, punctuation, etc.) rather than hard-coded rules.
- **Q24 — Lifecycle:** disable, never delete (v1). Disabling instantly kills sessions and API keys; `createBy` remains an immutable snapshot; admins may reset passwords (forces change at next login).
- **Q25 — API keys:** `sk_` format, hashed at rest, no default expiry, instant revocation, masked display; every grade manages its own keys; admin can revoke any key.
- **Q26 — SSO:** **NO auto-provision** — SSO sign-in is rejected when no local account matches (overrides research 03's auto-provision default). Admin promotes/assigns profiles manually. Open detail: how an external identity gets linked to a local account — **Q28**.
- **Q27 — Sessions:** core-issued HttpOnly cookie; dashboard and WebUI forward it server-side; no tokens in browser storage.

## Open before resolution

- **Q28 — SSO linking mechanism** (how an external IdP identity becomes attached to an existing local account, given no auto-provision).
