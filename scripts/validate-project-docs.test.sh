#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

test -x "$root/scripts/validate-project-docs.sh"
"$root/scripts/validate-project-docs.sh"

cd "$root"
node -e "for (const p of ['backend/package.json','frontend/package.json']) { const v=require('./'+p).engines.node; if (v !== '>=20.19.0') throw new Error(p+' has unsupported Node range '+v) }"
