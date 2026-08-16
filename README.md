# Ziru

<p align="center">
  <img src="brand/ziru-logo.png" alt="Ziru logo" width="220">
</p>

**Ziru is the memory layer between complex, dirty documents and AI agents.**

Ziru ingests unstructured documents and produces persistent, navigable
memory: parsing, hierarchy extraction, multi-modal structuring, and graph
construction in a single pipeline. Every chunk retains full semantic context,
making the output a natural fit for *Agentic RAG*, *vector-based RAG*, or any
LLM workflow.

Ziru is a fork of [Knowhere](https://github.com/Ontos-AI/knowhere) by
Ontos-AI (Apache-2.0). The fork keeps the core algorithm — document hierarchy
reconstruction and agentic retrieval — while rebuilding the account model,
namespace isolation, and document organization around a simpler self-hosted
philosophy.

## Repository Layout

| Directory | Component | Stack |
|---|---|---|
| `core/` | Ziru API — document ingestion, parsing, graph construction, and agentic retrieval (API + Celery worker + shared library) | Python / FastAPI |
| `admin/` | Ziru Dashboard — manage API usage, API keys, optional billing, webhooks, and document-processing jobs | Next.js |
| `webui/` | Ziru WebUI — upload documents, explore parsed content, and ask questions | Next.js |
| `deploy/` | Ziru Self-Hosted — Docker Compose stack packaging the whole platform | Docker |
| `MinerU/` | Vendored MinerU document parser (see its license for terms) | Python |

## Quick Start (Self-Hosted)

```bash
cd deploy
cp .env.defaults .env      # then fill in your API keys
docker compose up -d
```

Open the dashboard at `http://localhost:3000/login`.

For development setups of individual components, see each component's README:

- API: [core/README.md](core/README.md)
- Dashboard: [admin/README.md](admin/README.md)
- WebUI: [webui/README.md](webui/README.md)
- Self-Hosted: [deploy/README.md](deploy/README.md)

## Documentation

- Architecture decisions: [core/docs/adr/](core/docs/adr/)
- Deployment configuration: [deploy/docs/configuration.md](deploy/docs/configuration.md)

## License

Ziru is licensed under the [Apache License 2.0](LICENSE). Attribution notices
for the upstream project are preserved in [NOTICE](NOTICE) and in the
per-component `NOTICE` files.

## Acknowledgements

Ziru is a fork of **Knowhere** by [Ontos-AI](https://github.com/Ontos-AI),
distributed under the Apache License 2.0. We are grateful for the original
architecture — in particular the document hierarchy reconstruction and
agentic retrieval pipeline — which this project builds upon. See
[NOTICE](NOTICE) for the upstream attribution notices.

Ziru uses [MinerU](https://github.com/opendatalab/MinerU) as its default PDF
parser, licensed under the Apache License 2.0 with additional terms (see
[MinerU/LICENSE.md](MinerU/LICENSE.md)).
