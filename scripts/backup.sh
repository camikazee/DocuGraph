#!/usr/bin/env bash
#
# DocuGraph backup — logical Mongo dump + tar of the workspace volume
# (source-of-truth .md files and local media). Read-only; writes timestamped
# archives to ./backups/. Run from the repo root while the stack is up.
#
#   ./scripts/backup.sh
#
# NOTE: also back up your secrets (JWT_SECRET, MEDIA_SECRET) separately — the
# encrypted credentials in Mongo are unrecoverable without MEDIA_SECRET.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="backups"
TS="$(date +%Y%m%d-%H%M%S)"
DB="${MONGO_DB:-docugraph}"
mkdir -p "$OUT"

compose() { docker compose "$@"; }

echo "→ Mongo dump (db=$DB)…"
compose exec -T mongo mongodump --archive --gzip --db="$DB" \
  >"$OUT/mongo-$TS.archive.gz"

echo "→ Workspace + media volume…"
BACKEND="$(compose ps -q backend)"
if [ -z "$BACKEND" ]; then
  echo "  ! backend container not running — cannot reach the workspace volume" >&2
  exit 1
fi
docker run --rm --volumes-from "$BACKEND" \
  -v "$PWD/$OUT":/backup alpine \
  tar czf "/backup/workspace-$TS.tgz" -C /data/workspaces .

echo "✓ Backup complete:"
echo "    $OUT/mongo-$TS.archive.gz"
echo "    $OUT/workspace-$TS.tgz"
echo "  Keep this pair together, and back up MEDIA_SECRET/JWT_SECRET too."
