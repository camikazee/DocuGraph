#!/usr/bin/env bash
set -euo pipefail

: "${FRONTEND_URL:?Set FRONTEND_URL, for example https://docs.example.com}"
: "${API_URL:?Set API_URL, for example https://api.docs.example.com/api/v1}"

attempts="${SMOKE_ATTEMPTS:-30}"
delay_seconds="${SMOKE_DELAY_SECONDS:-3}"
frontend="${FRONTEND_URL%/}"
api="${API_URL%/}"

get_with_retry() {
  local label="$1"
  local url="$2"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl -fsS --max-time 5 "$url" >/dev/null; then
      echo "OK: $label"
      return 0
    fi
    if ((attempt < attempts)); then sleep "$delay_seconds"; fi
  done
  echo "FAILED: $label ($url)" >&2
  return 1
}

get_with_retry "frontend" "$frontend"
get_with_retry "API liveness" "$api/health"
get_with_retry "API readiness" "$api/ready"

if [[ -n "${DG_TOKEN:-}" ]]; then
  whoami="$(curl -fsS --max-time 5 "$api/ci/whoami" -H "Authorization: Bearer $DG_TOKEN")"
  workspace_id="$(printf '%s' "$whoami" | sed -n 's/.*"workspaceId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  test -n "$workspace_id" || {
    echo "FAILED: /ci/whoami did not return workspaceId" >&2
    exit 1
  }
  curl -fsS --max-time 10 \
    "$api/workspaces/$workspace_id/documents/health" \
    -H "Authorization: Bearer $DG_TOKEN" >/dev/null
  echo "OK: authenticated documentation health"
fi

echo "Production read-only smoke passed."
