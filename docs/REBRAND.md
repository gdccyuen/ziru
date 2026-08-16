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

## Phase E — completed (August 2026)

- [x] Packages renamed: `ziru-api` (core), `ziru-api-app`, `ziru-worker-app`,
      `ziru-shared`, `@ziru/admin` (dashboard), `ziru-webui` (notebook).
- [x] Runtime identifiers renamed: S3 buckets `ziru-uploads`/`ziru-results`,
      PostgreSQL DB `ziru`, `REDIS_KEY_PREFIX=ziru-api`, SNS topic
      `ziru-s3-upload-events`, volumes `ziru_user_data`/`ziru_model_cache`/
      `ziru_secrets`, `/tmp/ziru`, `/opt/ziru`, `~/.ziru`, `ZIRU_IMAGE`,
      `APP_TITLE=Ziru API`.
- [x] Core code identifiers: `ZiruException`, `ziru_exception_handler`,
      `x-ziru-namespace` / `x-ziru-event-id` headers, MCP tool `ziru-retrieval`,
      `guest.ziru.local`, `ziru-api:` redis prefix, telemetry **default-off**
      (`TELEMETRY_ENABLED=false`) — **TODO: remove telemetry entirely**.
- [x] WebUI: `@ontos-ai/knowhere-sdk` dropped — local fetch client
      (`src/integrations/ziru.ts`) + local types (`ziru-sdk-types.ts`); API
      endpoints unchanged (`/v2/...`). Env vars renamed to `ZIRU_API_KEY`,
      `ZIRU_BASE_URL`, `ZIRU_KEYS_FILE`, `ZIRU_KEY_ENCRYPTION_KEY`; cookies
      `ziru-session`/`ziru-ws`; PostHog events `ziru_*`; DB schema renamed
      (`ziru_api_keys`, `active_ziru_api_key_id`, `ziru_job_id`,
      `ziru_document_id`) with conditional migration `0010_ziru_rename`.
- [x] Admin: `ZiruIcon*` components, `ZiruServiceJwt`, `ziruOutput`/
      `ziruAdvantage`/`ziruStripe`, landing/marketing copy + comparison data
      rebranded, i18n locales, health service `ziru-admin`, public assets
      (`comparison/tables/ziru.html`, `images/ziru`, `icons/ziru`).
- [x] Deploy: `prepare-sources.sh` stages from this monorepo (`../core`,
      `../admin`) instead of upstream sibling checkouts; Dockerfile paths
      updated; entrypoint/compose/smoke-test renamed.
- [x] Upstream workflows disabled: `admin/.github/workflows/deploy.yml.disabled`,
      `deploy/.github/workflows/publish-image.yml.disabled`.
- [x] Placeholders replaced with `gdccyuen/ziru` (CITATION.cff, issue templates).
- [x] Logo replaced: `brand/ziru-logo.png` (master) resized into
      `admin/public/images/ziru/{logo,logo-icon,logo-dark,app-icon}.png` and
      `webui/public/images/ziru/logo-icon.png`; webui HTML-icon metadata
      updated. Note: `logo-dark.png` is a copy of the light logo — a true
      dark variant may be needed for dark UI surfaces.

### Still deliberately "Knowhere" (reviewed, keep or revisit)

| Item | Why |
|---|---|
| npm package strings `@ontos-ai/knowhere-sdk` / `@ontos-ai/knowhere-claw` / `knowhere-python-sdk` in admin marketing code demos | Real published package names; demo copy needs a content decision (publish Ziru SDKs or rewrite demos) |
| `admin/LOCALIZATION_GUIDE.md` | Mirrors UI strings; redo together with UI branding pass |
| ADR bodies + session notes + `deploy/docs/adr/0001-local-mineru-mode.md` etc. | Historical records / personal working notes |
| `ghcr.io/gdccyuen/ziru:latest` image default | No image published yet — build & publish before public release |
| `ziru.app` / `docs.ziru.app` / `api.ziru.app` / `staging.ziru.app` placeholders in admin tests + landing copy | Placeholder product domain until the real one exists — replace before launch |
| Telemetry code (`TELEMETRY_*` settings, PostHog constants) | Default-off now; remove entirely in a later pass |
| MinerU attribution obligation | Must show "uses MinerU" in product UI (online-service clause) |
| `webui/docs/session-notes/` | Personal agent working notes |

## Verification

```bash
git grep -i ontos     # should hit only NOTICE + acknowledgements + vendored MinerU
git grep -i knowhere  # should hit only the items above + historical docs + MinerU
```
