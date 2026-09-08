# Bootstrap 5.3 local assets (offline self-hosting)

The unified Ziru UI loads Bootstrap 5.3 from this folder first, and falls back
to the jsDelivr CDN if the files are missing (see `webui/src/app/layout.tsx`).

To make it work fully offline, place the two Bootstrap 5.3.3 files here:

```
webui/public/bootstrap/
  bootstrap.min.css
  bootstrap.bundle.min.js
```

## How to obtain them (on a machine with internet)

Option A — download from the CDN and save them:

```bash
cd webui/public/bootstrap
curl -fsSL -o bootstrap.min.css \
  https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css
curl -fsSL -o bootstrap.bundle.min.js \
  https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js
```

Option B — from the npm package (run where `bootstrap` is available):

```bash
npm pack bootstrap@5.3.3
tar -xzf bootstrap-5.3.3.tgz package/dist/css/bootstrap.min.css package/dist/js/bootstrap.bundle.min.js
cp package/dist/css/bootstrap.min.css webui/public/bootstrap/
cp package/dist/js/bootstrap.bundle.min.js webui/public/bootstrap/
```

After the files are present, rebuild the webui image (`deploy/Dockerfile`) and the
CSS/JS are served from `webui/public/` so no external CDN is needed.
