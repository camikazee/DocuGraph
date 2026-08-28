#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT

printf '%s\n' '#!/usr/bin/env bash' \
  'args="$*"' \
  'if [[ "${FAIL_READY:-}" = 1 && "$args" == *"/ready"* ]]; then exit 22; fi' \
  'if [[ "$args" == *"/ci/whoami"* ]]; then printf '\''{"workspaceId":"11111111-1111-4111-8111-111111111111"}'\''; fi' \
  'exit 0' >"$fixture/curl"
chmod +x "$fixture/curl"

PATH="$fixture:$PATH" FRONTEND_URL="https://front.example" \
  API_URL="https://api.example/api/v1" DG_TOKEN="test-token" \
  SMOKE_ATTEMPTS=1 SMOKE_DELAY_SECONDS=0 \
  "$root/scripts/smoke-production-readonly.sh"

if PATH="$fixture:$PATH" FRONTEND_URL="https://front.example" \
  API_URL="https://api.example/api/v1" FAIL_READY=1 \
  SMOKE_ATTEMPTS=1 SMOKE_DELAY_SECONDS=0 \
  "$root/scripts/smoke-production-readonly.sh" >/dev/null 2>&1; then
  echo "Smoke unexpectedly accepted failed readiness" >&2
  exit 1
fi

echo "Production smoke script tests passed."
