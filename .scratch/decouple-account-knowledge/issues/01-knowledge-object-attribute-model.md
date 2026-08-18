# 01 — Knowledge Object Attribute Model

Type: grilling
Status: claimed
Claimed by: agent (charting session, 2026-08-18)
Blocked by: —

## Question

Define the attribute model for knowledge objects precisely:

- Which keys are built in (`user` = uploader, `createTime`, …) and which are free-form (`division`, …)? Single value or multiple values per key?
- What does a user profile look like (e.g. a set of constraints like `division=finance`), and how is it stored and managed?
- Exactly how does fail-closed matching work — a non-admin sees a document only when it satisfies every constraint in the profile? What happens to documents missing a key the profile constrains (invisible)?
- Can a document have no attributes (admin-only visibility)? Must uploads carry at least one attribute?
- How do attributes appear in the search UI and the retrieval API (filters; default scope = own profile; shrink-only)?

This is the foundation ticket: its answers shape the knowledge API surface (04) and the WebUI rework (05).
