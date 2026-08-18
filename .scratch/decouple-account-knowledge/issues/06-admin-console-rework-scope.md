# 06 — Admin Console Rework Scope

Type: grilling
Status: resolved
Resolved: 2026-08-18 (grilling session with PM, Q36–Q40)
Blocked by: —

## Question

What does the dashboard become after billing removal?

## Answer

Resolved with the PM (Q36–Q40, all as recommended):

- **Marketing (Q36):** landing/marketing pages and the newsletter are deleted in v1; the login page keeps a clean branded look.
- **Page inventory (Q37):** Users (create the three grades, set grades/profiles, disable, reset passwords, pre-link SSO identity at creation); API keys (all, masked, revoke any); Attribute dictionary (new page); Job & document monitoring (default dashboard view); Webhooks (kept). Deleted: billing, credits, buy-credits, usage cost stats (usage table keeps job monitoring), guest, register/forgot-password (no self-signup), Apple/GitHub/magic-link auth callbacks (SSO lives in core). The dashboard becomes **stateless** — its own database disappears; it only talks to the core API.
- **Webhooks (Q38):** kept in v1 (job-event publication + secrets management) — resolves the map's open fog.
- **Server settings (Q39):** read-only configuration panel in v1 (env-file-backed: job cap, model defaults, DeepSeek/MinerU endpoints); UI editing deferred.
- **On-prem extras (Q40):** health/status panel on the dashboard home — API, worker, database/storage, job queue depth.

- Page inventory: users (create/reset/disable the three grades), API keys, server settings, job/document monitoring — what stays, what is deleted (credits, subscriptions, usage/billing, guest).
- Server settings: which knobs are UI-editable (concurrent-job cap, default model, DeepSeek/MinerU endpoints) vs environment-file-only.
- First-login forced password change flow.
- Anything else the dashboard should gain for on-prem operators.
