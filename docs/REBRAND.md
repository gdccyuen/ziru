# Ziru Rebrand — Status & Decision Record

> Why this file exists: Ziru is a fork of [Knowhere](https://github.com/Ontos-AI/knowhere)
> (Ontos-AI, Apache-2.0). This record tracks what was renamed, what must
> **never** be renamed, and what remains to be done — so any contributor or
> agent can continue the rebrand without re-auditing the repo.

## Provenance (legal — never touch)

- `LICENSE` — Apache-2.0 (canonical text, normalized).
- `NOTICE` — Ziru copyright + fork statement + the two upstream notices
  reproduced verbatim. **Additions only, never edits.**
- `core/LICENSE`, `core/NOTICE`, `admin/LICENSE`, `admin/NOTICE` —
  byte-identical copies of the upstream files, preserved in place.
- `MinerU/LICENSE.md` — vendored MinerU license (Apache-2.0 **plus commercial
  terms**). MinerU requires visible "uses MinerU" attribution when offered as
  an online service — keep that credit in the product.
- No source files carry copyright headers; Apache-2.0 does not require adding
  "modified by" notices, so none were added.

## Done (August 2026)

- [x] Root `NOTICE`, `README.md`, `.gitignore` created.
- [x] All component READMEs (`core/`, `admin/`, `webui/`, `deploy/` EN + zh-CN)
      rebranded; upstream SaaS pointers, badges, and hiring ad removed.
- [x] `core/CITATION.cff`, `core/SECURITY.md`, `admin/SECURITY.md`,
      `core/CONTRIBUTING.md`, `admin/CONTRIBUTING.md`, `admin/CODE_OF_CONDUCT.md`
      rewritten. (core CoC was already generic.)
- [x] `AGENTS.md` / `CONTEXT.md` prose rebranded (identifiers left untouched).
- [x] GitHub issue templates: upstream contacts (`team@knowhereto.ai`,
      `docs.knowhereto.ai`) removed.
- [x] `deploy/docs/configuration.md` + `configuration.zh-CN.md` prose and
      example values rebranded.
- [x] `MinerU/MinerU_CLA.md` and `MinerU/.github/` removed (upstream-only
      governance/CI for a vendored dependency).
- [x] Brand assets placed in `brand/` (`ziru-logo.png` master + design prompt).
- [x] Root README shows the logo.

## Deliberately still says "Knowhere" (by design)

| Area | Reason |
|---|---|
| Runtime identifiers: `KNOWHERE_*` env vars, `config/knowhere-keys.json`, `knowhere_api_keys` table, `listKnowhereNamespaces`, `~/.knowhere`, S3 buckets `knowhere-uploads`/`knowhere-results`, `knowhere_secrets` volume, DB name `Knowhere`, `REDIS_KEY_PREFIX=knowhere-api`, SNS topic `knowhere-s3-upload-events`, `/tmp/knowhere`, `/opt/knowhere`, `knowhere-worker-heartbeat.json` | Renaming paths/volumes/buckets affects existing deployments — Phase E decision |
| ADR bodies (`core/docs/adr/*`, `webui/docs/adr/*`, `deploy/docs/adr/*`) | ADRs are immutable historical records (only the index intro was updated) |
| `webui/docs/session-notes/`, `deploy/docs/hand0ff-table-chunk.md` | Personal working notes; upstream PR links are historical references |
| `webui/pnpm-workspace.yaml` → `@ontos-ai/knowhere-sdk@2.0.0` | Real npm dependency; still functional against the API |
| CI workflows (`admin/deploy.yml` knowhereto.ai URLs, `core/build-images.yml` ECR names, `deploy/publish-image.yml` `ghcr.io/ontos-ai/knowhere`) | Phase E; deploys only trigger on `staging` / releases / manual dispatch |
| `admin/LOCALIZATION_GUIDE.md` | Mirrors actual UI strings; redo together with the UI rebrand |
| `OPENAI_ADS_PIXEL_ID` example value in admin README | Upstream pixel ID — replace with the fork's own if ads are used |

## Phase E — remaining punch list

### Decisions needed
- [ ] Dashboard npm package name (`@ziru/dashboard` vs `@ziru/admin`).
- [ ] Runtime identifier renames (breaking for existing installs) — approved?
- [ ] Telemetry: currently default-on and sent to the upstream operator's
      PostHog. Decide: default-off, or point at own PostHog.
- [ ] `~/.knowhere` → `~/.ziru`: migrate existing corpora or fresh start.
- [ ] What to do with upstream-deployment workflows (`deploy.yml`,
      `publish-image.yml`) — disable until repointed at own infra.

### Mechanical (approved items only)
- [ ] Rename packages: `knowhere-api` → `ziru-api`, `knowhere-shared` →
      `ziru-shared`, `@knowhere/web` → `@ziru/<dashboard>`, `knowhere-notebook`
      → `ziru-webui`.
- [ ] `APP_TITLE` defaults (`core/apps/api/.env.example`,
      `core/apps/worker/.env.example`, settings code).
- [ ] `deploy/scripts/prepare-sources.sh`: stage from this monorepo's
      `core/` + `admin/` instead of upstream sibling checkouts.
- [ ] Image/ECR/GHCR names in workflows and `compose.yaml`.
- [ ] Docker volume/container/network names.
- [ ] S3 bucket names, Redis prefix, SNS topic, DB name (if approved).
- [ ] WebUI SDK dependency decision (keep upstream SDK vs fork).
- [ ] Replace `your-org/ziru` placeholders (`core/CITATION.cff`,
      issue-template `config.yml`) with `gdccyuen/ziru`.
- [ ] Admin UI strings + `LOCALIZATION_GUIDE.md` redo.
- [ ] Logo integration into `admin/` and `webui/` public assets + layouts.

## Verification

```bash
git grep -i ontos     # should hit only NOTICE + acknowledgements + vendored MinerU
git grep -i knowhere  # should hit only runtime identifiers + historical docs + MinerU
```
