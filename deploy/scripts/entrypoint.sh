#!/usr/bin/env bash
set -Eeuo pipefail

coreRoot="/opt/ziru/source/core"
venv="/opt/ziru/venv"
sitecustomizeDir="/opt/ziru/sitecustomize"

export PATH="${venv}/bin:${PATH}"

runAlembic() {
  echo "Running database migrations (alembic upgrade head)"
  (
    cd "${coreRoot}/apps/api"
    DATABASE_URL="${DATABASE_URL}" python -m alembic upgrade head
  )
}

case "${MODE:-}" in
  api)
    runAlembic
    export PYTHONPATH="${coreRoot}/apps/api:${coreRoot}/packages/shared-python${PYTHONPATH:+:${PYTHONPATH}}"
    echo "Starting Ziru API on port 5005"
    cd "${coreRoot}/apps/api"
    exec python -m uvicorn main:app --host 0.0.0.0 --port 5005
    ;;
  worker)
    runAlembic
    export PYTHONPATH="${coreRoot}/apps/worker:${coreRoot}/packages/shared-python:${sitecustomizeDir}${PYTHONPATH:+:${PYTHONPATH}}"
    echo "Starting Ziru worker"
    cd "${coreRoot}/apps/worker"
    exec python worker.py
    ;;
  admin)
    echo "Starting Ziru admin console on port 3001"
    cd /opt/ziru/admin
    exec ./node_modules/.bin/next start -p 3001 --hostname 0.0.0.0
    ;;
  webui)
    echo "Starting Ziru webui on port 3000"
    cd /opt/ziru/webui
    exec ./node_modules/.bin/next start -p 3000 --hostname 0.0.0.0
    ;;
  *)
    echo "Unknown MODE '${MODE:-}'. Expected one of: api, worker, admin, webui." >&2
    exit 1
    ;;
esac
