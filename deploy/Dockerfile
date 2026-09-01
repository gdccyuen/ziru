# syntax=docker/dockerfile:1.7

ARG PYTHON_IMAGE=python:3.13-slim
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Python dependencies (one venv for the api + worker + shared-python workspace)
# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS python-deps

ENV UV_CACHE_DIR=/root/.cache/uv \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /opt/ziru/source/core

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc g++ curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python -m pip install --no-cache-dir uv

# Only the manifests are needed to resolve the workspace; shared-python ships
# its full source because it is the one buildable workspace member.
COPY core/pyproject.toml core/uv.lock ./
COPY core/apps/api/pyproject.toml apps/api/pyproject.toml
COPY core/apps/worker/pyproject.toml apps/worker/pyproject.toml
COPY core/packages/shared-python ./packages/shared-python

RUN UV_PROJECT_ENVIRONMENT=/opt/ziru/venv uv sync --locked --no-dev --no-editable --all-packages

# ---------------------------------------------------------------------------
# Admin console (Next.js) build
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS admin-deps

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /opt/ziru/source/admin

COPY admin/package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps

FROM ${NODE_IMAGE} AS admin-builder

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=http://api:5005/api \
    NEXT_PUBLIC_AUTH_BASE_URL=/api/auth \
    NEXT_PUBLIC_APP_URL=http://localhost:81 \
    BETTER_AUTH_SECRET=build-validation-only-auth-secret-32-chars \
    BETTER_AUTH_URL=http://localhost:81 \
    BILLING_ENABLED=false \
    RESEND_API_KEY=re_build_validation_placeholder \
    SKIP_ENV_VALIDATION=1

WORKDIR /opt/ziru/source/admin

COPY --from=admin-deps /opt/ziru/source/admin/node_modules ./node_modules
COPY admin/ ./

RUN rm -rf .next && npm run build

# ---------------------------------------------------------------------------
# WebUI (Next.js) build
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS webui-deps

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /opt/ziru/source/webui

COPY webui/package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts --legacy-peer-deps

FROM ${NODE_IMAGE} AS webui-builder

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=http://api:5005/api

WORKDIR /opt/ziru/source/webui

COPY --from=webui-deps /opt/ziru/source/webui/node_modules ./node_modules
COPY webui/ ./

RUN rm -rf .next && npm run build

# ---------------------------------------------------------------------------
# Runtime: python venv + node runtime + built admin + built webui
# ---------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONUNBUFFERED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PATH=/opt/ziru/venv/bin:/usr/local/bin:/usr/bin:/bin

WORKDIR /opt/ziru

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    fonts-dejavu-core \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libreoffice-calc \
    libreoffice-core \
    libreoffice-impress \
    libreoffice-writer \
    postgresql-client \
    redis-tools \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && update-ca-certificates \
  && mkdir -p /data/users /data/storage /tmp/ziru /opt/ziru/sitecustomize

# Node runtime (binaries + npm/npx). Both images are Debian bookworm, so the
# node binary is ABI-compatible with this python-slim base.
COPY --from=admin-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=admin-deps /usr/local/bin/npm /usr/local/bin/npm
COPY --from=admin-deps /usr/local/bin/npx /usr/local/bin/npx
COPY --from=admin-deps /usr/local/lib/node_modules /usr/local/lib/node_modules

# Python venv + application source.
COPY --from=python-deps /opt/ziru/venv /opt/ziru/venv
COPY core /opt/ziru/source/core
COPY deploy/sitecustomize.py /opt/ziru/sitecustomize/sitecustomize.py

# Built Next.js apps (node_modules + .next + config/public stay together so
# `next start` works without a rebuild).
COPY --from=admin-builder /opt/ziru/source/admin /opt/ziru/admin
COPY --from=webui-builder /opt/ziru/source/webui /opt/ziru/webui

# Make the gevent/billiard logging shim importable automatically on 3.13.
RUN /opt/ziru/venv/bin/python -c 'import shutil, site; shutil.copy("/opt/ziru/sitecustomize/sitecustomize.py", site.getsitepackages()[0] + "/sitecustomize.py")'

COPY deploy/scripts/entrypoint.sh /usr/local/bin/ziru-entrypoint
RUN chmod +x /usr/local/bin/ziru-entrypoint

EXPOSE 3000 3001 5005

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/ziru-entrypoint"]
