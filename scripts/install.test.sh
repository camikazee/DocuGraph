#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/project"
fake_bin="$tmp/bin"
mkdir -p "$fixture" "$fake_bin"
cp "$root/.env.example" "$fixture/.env.example"
cp "$root/docker-compose.yml" "$fixture/docker-compose.yml"

cat > "$fake_bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"
if [[ "${FAKE_DOCKER_FAIL:-0}" == '1' ]]; then
  exit 1
fi
exit 0
SH
chmod +x "$fake_bin/docker"
export FAKE_DOCKER_LOG="$tmp/docker.log"

PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/install.sh" --no-start --url https://docs.example.com

grep -Eq '^JWT_SECRET=[0-9a-f]{96}$' "$fixture/.env"
grep -Eq '^MEDIA_SECRET=[0-9a-f]{96}$' "$fixture/.env"
test "$(sed -n 's/^APP_URL=//p' "$fixture/.env")" = 'https://docs.example.com'
test "$(sed -n 's/^JWT_SECRET=//p' "$fixture/.env")" != \
  "$(sed -n 's/^MEDIA_SECRET=//p' "$fixture/.env")"
test "$(stat -c '%a' "$fixture/.env")" = '600'
grep -q 'compose version' "$FAKE_DOCKER_LOG"
grep -q 'config --quiet' "$FAKE_DOCKER_LOG"
! grep -q 'up -d' "$FAKE_DOCKER_LOG"

cp "$fixture/.env" "$fixture/original.env"
PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/install.sh" --no-start
cmp "$fixture/.env" "$fixture/original.env"

if PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/install.sh" --no-start --url 'https://docs.example.com/path' \
  > "$tmp/invalid.out" 2>&1; then
  echo 'Installer accepted an APP_URL with a path.' >&2
  exit 1
fi
grep -q 'must be an http(s) origin' "$tmp/invalid.out"

export FAKE_DOCKER_FAIL=1
if PATH="$fake_bin:$PATH" DOCUGRAPH_ROOT="$fixture" \
  "$root/scripts/install.sh" --no-start > "$tmp/docker-fail.out" 2>&1; then
  echo 'Installer continued without working Docker Compose.' >&2
  exit 1
fi
grep -q 'Docker Compose v2 is required' "$tmp/docker-fail.out"

echo 'Installer tests passed.'
