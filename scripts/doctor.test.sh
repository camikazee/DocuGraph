#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/project"
fake_bin="$tmp/bin"
mkdir -p "$fixture" "$fake_bin"
cp "$root/.env.example" "$fixture/.env"
cp "$root/docker-compose.yml" "$fixture/docker-compose.yml"

cat > "$fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
printf '%s\n' "$args" >> "${FAKE_DOCKER_LOG:?}"
case "$args" in
  *'exec -T mongo'*) exit "${FAKE_MONGO_STATUS:-0}" ;;
  *'exec -T backend'*) exit "${FAKE_BACKEND_STATUS:-0}" ;;
  *'exec -T frontend'*) exit "${FAKE_FRONTEND_STATUS:-0}" ;;
  *) exit 0 ;;
esac
SH
chmod +x "$fake_bin/docker"
export FAKE_DOCKER_LOG="$tmp/docker.log"
export DOCUGRAPH_DOCTOR_ATTEMPTS=1
export DOCUGRAPH_DOCTOR_DELAY_SECONDS=0

PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/doctor.sh" --config-only > "$tmp/config.out"
grep -q '^OK  Compose configuration$' "$tmp/config.out"
! grep -q 'exec -T' "$FAKE_DOCKER_LOG"

: > "$FAKE_DOCKER_LOG"
PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/doctor.sh" > "$tmp/healthy.out"
grep -q '^OK  Compose configuration$' "$tmp/healthy.out"
grep -q '^OK  MongoDB$' "$tmp/healthy.out"
grep -q '^OK  Backend readiness$' "$tmp/healthy.out"
grep -q '^OK  Frontend$' "$tmp/healthy.out"

export FAKE_BACKEND_STATUS=1
if PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/doctor.sh" > "$tmp/unhealthy.out" 2>&1; then
  echo 'Doctor accepted a failed backend probe.' >&2
  exit 1
fi
grep -q '^FAIL  Backend readiness$' "$tmp/unhealthy.out"
grep -q '^OK  Frontend$' "$tmp/unhealthy.out"

echo 'Doctor tests passed.'
