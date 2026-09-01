# ADR 0001: MinerU is local-only (cloud path removed)

Date: 2026-07-22 (supersedes the earlier local-mode stopgap ADR)

## Status

Accepted. The product is on-premise only. The MinerU cloud ingestion path has
been removed permanently.

## Context

MinerU is a self-hosted PDF parsing service. Ziru's worker calls its
synchronous parse endpoint and no longer has any path that talks to the hosted
MinerU service. The previous implementation carried two ingestion flows
(direct upload and URL-based task submission) plus a quota manager and polling
helper; those were only useful with a hosted API key and are dead code in an
on-premise product.

## Decision

- `parse_via_full` is now a thin wrapper that always calls `parse_via_local`.
- `parse_via_local` posts the PDF as multipart form data to
  `{MINERU_URL}/file_parse`, then flattens and archives the returned ZIP (or
  handles the inline JSON fallback).
- The quota manager and task polling modules were deleted.
- Cloud-only configuration fields were removed from
  `shared.core.config.mineru`. The remaining MinerU settings are
  `MINERU_URL`, `MINERU_LOCAL_LANG_LIST`, `MINERU_LOCAL_BACKEND`, and
  `MINERU_LOCAL_TIMEOUT`.
- `MINERU_SHARD_CONCURRENCY` remains in the storage config and controls how
  many shards the worker sends to the local MinerU service concurrently.

## Consequences

- No MinerU API key is configured or required.
- Deploy configuration only needs `MINERU_URL` pointing at the self-hosted
  MinerU instance.
- The worker cannot accidentally fall back to a hosted MinerU endpoint.
