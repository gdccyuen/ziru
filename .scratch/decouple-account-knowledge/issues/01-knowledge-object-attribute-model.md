# 01 — Knowledge Object Attribute Model

Type: grilling
Status: resolved
Resolved: 2026-08-18 (grilling session with PM)
Blocked by: —

## Question

Define the attribute model for knowledge objects precisely:

- Which keys are built in (`user` = uploader, `createTime`, …) and which are free-form (`division`, …)? Single value or multiple values per key?
- What does a user profile look like (e.g. a set of constraints like `division=finance`), and how is it stored and managed?
- Exactly how does fail-closed matching work — a non-admin sees a document only when it satisfies every constraint in the profile? What happens to documents missing a key the profile constrains (invisible)?
- Can a document have no attributes (admin-only visibility)? Must uploads carry at least one attribute?
- How do attributes appear in the search UI and the retrieval API (filters; default scope = own profile; shrink-only)?

This is the foundation ticket: its answers shape the knowledge API surface (04) and the WebUI rework (05).

## Answer

Resolved with the PM (Q13–Q17):

- **Attribute dictionary (Q13):** attribute keys are admin-managed. The admin defines the allowed keys (and optionally the allowed values per key) in the dashboard; uploaders pick from the dictionary; profiles are built from the same dictionary. Prevents typo-driven access-control failures.
- **Multi-value (Q14):** a document may carry several values for one key (`division=finance` AND `division=sales`). A profile constraint for a key matches when any of the document's values is in the profile's allowed set; a profile may allow several values per key.
- **Profile matching (Q15):** a profile is a list of key → allowed-values constraints. A non-admin sees a document only if it satisfies EVERY constraint (fail-closed, per key). Admin implicitly has no constraints (sees everything).
- **Mandatory built-ins (Q16, modified):** every knowledge object carries two hard-wired, auto-set attributes: `createBy` (the uploading account) and `createTime` (ingestion time). They can never be removed or edited by anyone. Librarians may remove all OTHER (dictionary) attributes; the mandatory pair always remains. Admins may upload documents with no dictionary attributes — visible to admins only until tagged.
- **Built-in naming (Q17, modified):** `user` is renamed `createBy`. Both built-ins are immutable system facts, usable in search filters (e.g. "docs createdBy X", "created after March").
- **Editing rules** remain per Q8: admin edits any dictionary attributes; librarian edits only within own profile, may strip dictionary attributes down to zero but never the mandatory pair. Visibility changes live (Q10 applies to keys; attribute edits take effect immediately).
