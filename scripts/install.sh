#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${DOCUGRAPH_ROOT:-$(cd "$script_dir/.." && pwd)}"
build=false
no_start=false
app_url='http://localhost:3002'
url_supplied=false

usage() {
  cat <<'EOF'
Usage: ./scripts/install.sh [--build] [--no-start] [--url URL]

  --build       Build frontend and backend from this checkout.
  --no-start    Generate and validate configuration without starting services.
  --url URL     Public DocuGraph origin, e.g. https://docs.example.com.
EOF
}

while (($#)); do
  case "$1" in
    --build)
      build=true
      ;;
    --no-start)
      no_start=true
      ;;
    --url)
      shift
      if (($# == 0)); then
        echo 'ERROR: --url requires a value.' >&2
        usage >&2
        exit 2
      fi
      app_url="$1"
      url_supplied=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ ! "$app_url" =~ ^https?://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?/?$ ]]; then
  echo 'ERROR: APP_URL must be an http(s) origin without a path, query, or fragment.' >&2
  exit 2
fi
app_url="${app_url%/}"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo 'ERROR: Docker Compose v2 is required. Install Docker Desktop or Docker Engine with the Compose plugin.' >&2
  exit 1
fi

if [[ ! -s "$root/.env.example" || ! -s "$root/docker-compose.yml" ]]; then
  echo "ERROR: DocuGraph installation files are missing under $root." >&2
  exit 1
fi

generate_secret() {
  od -An -N48 -tx1 /dev/urandom | tr -d ' \n'
}

if [[ ! -e "$root/.env" ]]; then
  jwt_secret="$(generate_secret)"
  media_secret="$(generate_secret)"
  while [[ "$media_secret" == "$jwt_secret" ]]; do
    media_secret="$(generate_secret)"
  done

  env_tmp="$(mktemp "$root/.env.tmp.XXXXXX")"
  trap 'rm -f "${env_tmp:-}"' EXIT
  sed \
    -e "s|^APP_URL=.*$|APP_URL=$app_url|" \
    -e "s|^JWT_SECRET=.*$|JWT_SECRET=$jwt_secret|" \
    -e "s|^MEDIA_SECRET=.*$|MEDIA_SECRET=$media_secret|" \
    "$root/.env.example" > "$env_tmp"
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$root/.env"
  trap - EXIT
  echo "Created $root/.env with unique installation secrets."
elif [[ "$url_supplied" == true ]]; then
  echo 'Existing .env preserved; --url was not applied. Edit APP_URL explicitly to change the public origin.'
else
  echo "Existing $root/.env preserved."
fi

compose=(docker compose --env-file "$root/.env" -f "$root/docker-compose.yml")
"${compose[@]}" config --quiet
echo 'Compose configuration is valid.'

if [[ "$no_start" == true ]]; then
  exit 0
fi

if [[ "$build" == true ]]; then
  "${compose[@]}" up -d --build
else
  "${compose[@]}" pull
  "${compose[@]}" up -d --no-build
fi

DOCUGRAPH_ROOT="$root" "$script_dir/doctor.sh"

configured_url="$(sed -n 's/^APP_URL=//p' "$root/.env" | head -n 1)"
echo
echo "DocuGraph is ready at ${configured_url:-http://localhost:3002}"
echo 'Back up MongoDB, workspace storage, and .env together.'
