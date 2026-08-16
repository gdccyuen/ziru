# Contributing

Thanks for contributing to Ziru. This monorepo hosts the API core; the
dashboard, web UI, and self-hosted packaging live in sibling directories —
make sure you're working in the right one.

## Repository Layout

| Directory | Description |
|---|---|
| `core/` | **This directory.** Backend API and worker — document ingestion, parsing, graph construction, and retrieval. |
| `admin/` | The dashboard. Manages API usage, API keys, billing, webhooks, and document jobs. |
| `webui/` | The notebook-style web UI. Uploads documents, explores parsed content, and answers questions. |
| `deploy/` | Docker Compose stack for self-hosted deployments. Packages the API, worker, dashboard, and web UI together. |
| `MinerU/` | Vendored MinerU document parser dependency. Do not modify; see its license for terms. |

## Before You Start

- Open or confirm an issue before starting significant changes.
- Keep changes scoped and reviewable.
- Do not commit real secrets, deployment credentials, or environment-specific
  private data.

## Branching

- Do not push directly to protected branches.
- Use `main` as the default source branch and pull request target.
- Use a dedicated feature or fix branch for each change.
- Name branches as `<type>/<user>/<description>`.
- Use a lowercase `type`, preferably one of `feat`, `fix`, `refactor`,
  `chore`, `docs`, `test`, `perf`, `ci`, `build`, or `revert`.
- Use the human owner or contributor name for `user`; do not use a generic
  tool name such as `codex`.
- Keep `description` short, lowercase, and kebab-case, for example
  `refactor/alice/extract-chunk-converter`.

## Development Flow

`main` is the public development trunk. Contributors and maintainers develop
against `main`.

### Contributor workflow

1. Fork the repository or create a branch from the latest `main`.
2. Use a dedicated branch such as `docs/alice/add-faq` or
   `fix/alice/retrieval-timeout`.
3. Open the pull request against `main`.
4. Wait for review and required checks.
5. Keep the pull request focused; split unrelated changes into separate pull
   requests.

Pull requests to `main` run CI, secret scanning, and CodeQL.

### Maintainer development workflow

Internal changes follow the same trunk workflow:

1. Create a branch from `main`.
2. Open a pull request to `main`.
3. Merge after review and green checks.

## Development Setup

Sync the Python services and shared package:

```bash
cd core/packages/shared-python && uv sync
cd ../../apps/api && uv sync
cd ../worker && uv sync
```

Start the local services:

```bash
cd core/deploy/local-dev && ./start-dev.sh
```

## Pull Requests

- Write a clear title and summary.
- Explain API, schema, or behavior changes explicitly.
- Call out migration, workflow, and documentation impacts.
- Add or update tests when behavior changes.
- Keep documentation aligned with the implementation.
