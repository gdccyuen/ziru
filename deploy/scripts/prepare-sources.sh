#!/usr/bin/env bash
set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspaceRoot="$(dirname "$repoRoot")"
sourceRoot="${repoRoot}/.build/sources"

# CI passes explicit checkout paths and refs. Local builds default to the
# monorepo's core/ and admin/ directories and archive their current HEAD
# unless these env vars are overridden.
apiSource="${ZIRU_API_SOURCE:-${workspaceRoot}/core}"
apiRef="${ZIRU_API_REF:-HEAD}"
dashboardSource="${ZIRU_DASHBOARD_SOURCE:-${workspaceRoot}/admin}"
dashboardRef="${ZIRU_DASHBOARD_REF:-HEAD}"

copySource() {
  local sourcePath="$1"
  local sourceRef="$2"
  local targetPath="$3"
  local label="$4"

  if [ ! -d "$sourcePath" ]; then
    echo "Missing ${label} source directory: ${sourcePath}" >&2
    exit 1
  fi

  rm -rf "$targetPath"
  mkdir -p "$targetPath"

  if git -C "$sourcePath" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    gitRepoRoot="$(git -C "$sourcePath" rev-parse --show-toplevel)"
    gitRelPath="$(git -C "$sourcePath" rev-parse --show-prefix)"
    if [ -n "$gitRelPath" ]; then
      # The source is a subdirectory of a larger repository (this monorepo):
      # archive only that subtree and strip the leading path component.
      git -C "$gitRepoRoot" archive --format=tar "$sourceRef" -- "${gitRelPath%/}" \
        | tar -xf - --strip-components=1 -C "$targetPath"
    else
      git -C "$sourcePath" archive --format=tar "$sourceRef" | tar -xf - -C "$targetPath"
    fi
    return
  fi

  tar \
    --exclude='.git' \
    --exclude='.venv' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='coverage' \
    --exclude='dist' \
    -C "$sourcePath" \
    -cf - . | tar -xf - -C "$targetPath"
}

mkdir -p "$sourceRoot"
copySource "$apiSource" "$apiRef" "${sourceRoot}/core" "Ziru API"
copySource "$dashboardSource" "$dashboardRef" "${sourceRoot}/admin" "Ziru dashboard"

echo "Prepared sources:"
echo "  API:       ${apiSource} @ ${apiRef}"
echo "  Dashboard: ${dashboardSource} @ ${dashboardRef}"
