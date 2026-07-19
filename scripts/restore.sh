#!/usr/bin/env bash
#
# DocuGraph restore — DESTRUCTIVE. Restores a Mongo dump (with --drop) and
# replaces the workspace volume contents from a tar produced by backup.sh.
# Run from the repo root while the stack is up.
#
#   ./scripts/restore.sh backups/mongo-<ts>.archive.gz backups/workspace-<ts>.tgz
#
# You must restore with the SAME MEDIA_SECRET the data was written with, or
# re-enter volume credentials / Git remotes afterwards.
set -euo pipefail

cd "$(dirname "$0")/.."

MONGO_ARCHIVE="${1:-}"
WORKSPACE_TAR="${2:-}"
DB="${MONGO_DB:-docugraph}"

if [ -z "$MONGO_ARCHIVE" ] || [ -z "$WORKSPACE_TAR" ]; then
  echo "usage: $0 <mongo.archive.gz> <workspace.tgz>" >&2
  exit 2
fi
for f in "$MONGO_ARCHIVE" "$WORKSPACE_TAR"; do
  [ -f "$f" ] || { echo "! not found: $f" >&2; exit 1; }
done

compose() { docker compose "$@"; }

echo "This will OVERWRITE the current database ($DB) and workspace files."
printf 'Type "restore" to continue: '
read -r confirm
[ "$confirm" = "restore" ] || { echo "aborted."; exit 1; }

echo "→ Restoring Mongo (--drop)…"
compose exec -T mongo mongorestore --archive --gzip --drop <"$MONGO_ARCHIVE"

echo "→ Restoring workspace + media volume…"
BACKEND="$(compose ps -q backend)"
if [ -z "$BACKEND" ]; then
  echo "  ! backend container not running — cannot reach the workspace volume" >&2
  exit 1
fi
ABS_TAR="$(cd "$(dirname "$WORKSPACE_TAR")" && pwd)/$(basename "$WORKSPACE_TAR")"
docker run --rm --volumes-from "$BACKEND" \
  -v "$ABS_TAR":/backup/workspace.tgz:ro alpine \
  sh -c 'rm -rf /data/workspaces/* && tar xzf /backup/workspace.tgz -C /data/workspaces'

echo "→ Restarting backend…"
compose restart backend

echo "✓ Restore complete. Verify sign-in, a document, and a media asset."
