# 0004 Derive Outline Quality From Published Sections

## Status

Accepted

## Context

Parse quality was computed twice from different populations — the worker scored
pre-splice heading rows, the API scored published sections — and the result was
stored in `document_metadata.parse_quality`, which four writers stamped in three
shapes and five readers parsed by convention. The stored value could drift from
what a reader actually sees, and once either producer had stamped it the other
could never correct it.

## Decision

Outline Quality is derived on read from a Document's published Document
Sections by one pure module that also owns the verdict policy. It is not stored:
the `document_metadata.parse_quality` field and the parse-time sidecar are
removed. The engine's parse-time score is no longer a Document's truth.

## Considered Options

- **Store it at publication** — cheap reads, but keeps a stored shape that can
  drift and needs migrating.
- **Store it via a post-commit effect** — reuses the Post-Commit Effect seam,
  still a stored copy.

Deriving deletes the storage seam outright (writers, readers, shapes, migration,
staleness) at the cost of one batched sections query per page.

## Consequences

- The read path pays one batched sections query per page; nothing is cached.
- Re-basing re-scores existing documents — empty headings drop out and path depth
  can differ from the parser's heading level — so some badges move.
- A future reader may be tempted to "optimise" by caching the verdict; that
  reintroduces exactly the drift this decision removes.
