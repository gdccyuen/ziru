# 04 — Knowledge API Surface

Type: prototype
Status: open
Blocked by: 01

## Question

What does the public API surface look like once namespaces and user ownership are gone?

- Upload with attributes: who may upload, which attributes are required vs optional.
- Retrieval/search: default scope = the caller's profile; optional narrower filters; what replaces the `namespace` parameter.
- Document metadata read and edit (attribute editing rules, Q8); delete (admin-only).
- Jobs and monitoring endpoints.
- Path/versioning changes — this is a clean start (Q12), so breaking changes are acceptable.

Deliverable: a rough endpoint-by-endpoint spec (a prototype) for the PM to react to.
