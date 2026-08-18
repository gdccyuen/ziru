# 07 — Billing & Credits Removal Inventory

Type: task
Status: claimed
Claimed by: agent (charting session, 2026-08-18) — background subagent
Blocked by: —

## Question

Produce the complete removal inventory for billing and credits:

- Every piece of billing/credit/tier/guest code, database table, config key, test, and UI surface across core, admin, and webui.
- Blast radius: what imports, contracts, and tests reference the removed pieces.
- What rate-limit/admission machinery remains after removal, and where the simple concurrent-job cap should live (Q4).
- A recommended deletion order that keeps the engine test suites green at every step.

Deliverable: inventory written to `.scratch/decouple-account-knowledge/research/billing-removal-inventory.md` on main — facts that later tickets and implementation rely on.
