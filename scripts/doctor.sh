#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${DOCUGRAPH_ROOT:-$(cd "$script_dir/.." && pwd)}"
config_only=false

case "${1:-}" in
  '') ;;
  --config-only) config_only=true ;;
  -h|--help)
    echo 'Usage: ./scripts/doctor.sh [--config-only]'
    exit 0
    ;;
  *)
    echo "ERROR: unknown option: $1" >&2
    exit 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo 'FAIL  Docker Compose v2'
  echo 'Install Docker Desktop or Docker Engine with the Compose plugin.' >&2
  exit 1
fi

if [[ ! -s "$root/.env" ]]; then
  echo 'FAIL  Configuration (.env is missing)'
  echo 'Run ./scripts/install.sh first.' >&2
  exit 1
fi

compose=(docker compose --env-file "$root/.env" -f "$root/docker-compose.yml")
if "${compose[@]}" config --quiet; then
  echo 'OK  Compose configuration'
else
  echo 'FAIL  Compose configuration'
  exit 1
fi

if [[ "$config_only" == true ]]; then
  exit 0
fi

failed=0
attempts="${DOCUGRAPH_DOCTOR_ATTEMPTS:-30}"
delay="${DOCUGRAPH_DOCTOR_DELAY_SECONDS:-2}"

run_with_retry() {
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    if ((attempt < attempts)); then
      sleep "$delay"
    fi
  done
  return 1
}

check() {
  local label="$1"
  shift
  if run_with_retry "$@"; then
    echo "OK  $label"
  else
    echo "FAIL  $label"
    failed=1
  fi
}

check 'MongoDB' \
  "${compose[@]}" exec -T mongo mongosh --quiet --eval \
  'quit(db.runCommand({ ping: 1 }).ok ? 0 : 1)'
check 'Backend readiness' \
  "${compose[@]}" exec -T backend node -e \
  "fetch('http://localhost:3000/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
check 'Frontend' \
  "${compose[@]}" exec -T frontend node -e \
  "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

if ((failed)); then
  echo 'Inspect details with: docker compose logs --tail=100' >&2
  exit 1
fi
