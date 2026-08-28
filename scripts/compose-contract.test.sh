#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sed \
  -e 's/^JWT_SECRET=$/JWT_SECRET=0123456789abcdef0123456789abcdef/' \
  -e 's/^MEDIA_SECRET=$/MEDIA_SECRET=fedcba9876543210fedcba9876543210/' \
  "$root/.env.example" > "$tmp/docugraph.env"

for compose_file in \
  docker-compose.yml \
  docker-compose.prod.yml \
  docker-compose.portainer.yml \
  docker-compose.demo.yml; do
  docker compose \
    --env-file "$tmp/docugraph.env" \
    -f "$root/$compose_file" \
    config --quiet
done

rendered="$tmp/rendered.yml"
docker compose \
  --env-file "$tmp/docugraph.env" \
  -f "$root/docker-compose.yml" \
  config > "$rendered"

test "$(grep -c 'published: "3002"' "$rendered")" -eq 1
grep -q 'DOCUGRAPH_API_UPSTREAM: http://backend:3000/api/v1' "$rendered"
grep -q 'JWT_SECRET: 0123456789abcdef0123456789abcdef' "$rendered"
grep -q 'MEDIA_SECRET: fedcba9876543210fedcba9876543210' "$rendered"
! grep -q 'published: "27017"' "$rendered"
! grep -q 'published: "3000"' "$rendered"

echo 'Compose installation contract is valid.'
