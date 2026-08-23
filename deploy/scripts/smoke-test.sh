#!/usr/bin/env bash
set -euo pipefail

composeFile="${COMPOSE_FILE:-compose.yaml}"
projectName="${COMPOSE_PROJECT_NAME:-ziru-self-hosted-smoke}"

# One-release backward compatibility: honor the legacy DASHBOARD_* names when
# the ADMIN_* names are not set.
if [ -n "${DASHBOARD_HOST_PORT:-}" ] && [ -z "${ADMIN_HOST_PORT:-}" ]; then
  export ADMIN_HOST_PORT="${DASHBOARD_HOST_PORT}"
  echo "DEPRECATION WARNING: DASHBOARD_HOST_PORT is deprecated; use ADMIN_HOST_PORT instead." >&2
fi
if [ -n "${DASHBOARD_SMOKE_URL:-}" ] && [ -z "${ADMIN_SMOKE_URL:-}" ]; then
  export ADMIN_SMOKE_URL="${DASHBOARD_SMOKE_URL}"
  echo "DEPRECATION WARNING: DASHBOARD_SMOKE_URL is deprecated; use ADMIN_SMOKE_URL instead." >&2
fi

export ADMIN_HOST_PORT="${ADMIN_HOST_PORT:-13000}"
export API_HOST_PORT="${API_HOST_PORT:-15005}"
export POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-15432}"
export REDIS_HOST_PORT="${REDIS_HOST_PORT:-16379}"
export LOCALSTACK_HOST_PORT="${LOCALSTACK_HOST_PORT:-14566}"

adminUrl="${ADMIN_SMOKE_URL:-http://127.0.0.1:${ADMIN_HOST_PORT}/login}"
apiUrl="${API_SMOKE_URL:-http://127.0.0.1:${API_HOST_PORT}/health}"

docker compose -p "$projectName" -f "$composeFile" up -d postgres redis localstack app

for attempt in {1..90}; do
  if curl -fsS "$apiUrl" >/dev/null 2>&1 && curl -fsS "$adminUrl" >/dev/null 2>&1; then
    echo "Smoke test passed"
    exit 0
  fi

  echo "Waiting for app smoke endpoints (${attempt}/90)..."
  sleep 2
done

docker compose -p "$projectName" -f "$composeFile" logs --no-color app
echo "Smoke test failed" >&2
exit 1
