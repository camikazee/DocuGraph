#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

test -x "$root/scripts/validate-project-docs.sh"
"$root/scripts/validate-project-docs.sh"

cd "$root"
node -e "for (const p of ['backend/package.json','frontend/package.json']) { const v=require('./'+p).engines.node; if (v !== '>=20.19.0') throw new Error(p+' has unsupported Node range '+v) }"

workflow="$root/.github/workflows/images.yml"
test -s "$workflow"
grep -q 'linux/amd64,linux/arm64' "$workflow"
grep -q 'packages: write' "$workflow"
grep -q 'DOCUGRAPH_REGISTRY:-ghcr.io/camikazee' "$root/docker-compose.prod.yml"
grep -q 'docugraph-backend' "$root/docker-compose.prod.yml"
grep -q 'DOCUGRAPH_API_UPSTREAM' "$root/docker-compose.prod.yml"
! grep -q 'NEXT_PUBLIC_API_URL' "$root/Jenkinsfile"
