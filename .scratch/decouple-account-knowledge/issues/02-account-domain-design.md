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
