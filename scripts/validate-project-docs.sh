#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required=(
  AGENTS.md .nvmrc Readme.md ROADMAP.md SECURITY.md DEPLOY.md
  docs/engineering/architecture.md
  docs/engineering/frontend-rules.md
  docs/engineering/backend-rules.md
  docs/engineering/http-contract.md
  docs/engineering/testing-rules.md
  docs/engineering/change-log.md
  docs/decisions/0001-product-ui-language-english.md
)

for file in "${required[@]}"; do
  test -s "$root/$file" || {
    echo "Missing project document: $file" >&2
    exit 1
  }
done

echo "Project documentation contract is complete."
