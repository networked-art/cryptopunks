#!/usr/bin/env bash
# Restore the latest `ponder-prod-block-*.zip` from `dumps/` into the local
# Postgres container started by `pnpm postgres:up`. Idempotent — `pg_restore
# --clean --if-exists` drops and recreates the schemas each run. Prints the
# active schema name afterwards (paste into `DATABASE_SCHEMA` in `.env.local`).
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PKG_DIR"

CONTAINER="punks-indexer-db"
DUMPS_DIR="$PKG_DIR/dumps"

ZIP=$(ls -t "$DUMPS_DIR"/ponder-prod-block-*.zip 2>/dev/null | head -1 || true)
if [[ -z "$ZIP" ]]; then
  echo "No snapshot found in $DUMPS_DIR (expected ponder-prod-block-*.zip)." >&2
  echo "Run the dump command first (see README §Local fork mode)." >&2
  exit 1
fi
NAME=$(basename "$ZIP" .zip)
DUMP_INSIDE="${NAME}.dump"
BLOCK=${NAME##*-block-}

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Container '$CONTAINER' not running. Start it with: pnpm postgres:up" >&2
  exit 1
fi

echo "Snapshot: $ZIP (block $BLOCK)"

echo -n "Waiting for $CONTAINER "
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U punks -d punks >/dev/null 2>&1; then
    echo "— ready."
    break
  fi
  echo -n "."
  sleep 1
done

echo "Restoring (this takes ~1-2 minutes)…"
unzip -p "$ZIP" "$DUMP_INSIDE" \
  | docker exec -i "$CONTAINER" pg_restore \
      -U punks -d punks --clean --if-exists --no-owner --no-acl

ACTIVE_SCHEMA=$(
  docker exec "$CONTAINER" psql -U punks -d punks -tA -c \
    "SELECT nspname FROM pg_namespace
     WHERE nspname LIKE 'ponder\_%' ESCAPE '\\'
       AND nspname <> 'ponder_sync'
     ORDER BY nspname LIMIT 1" \
    | tr -d '[:space:]'
)

echo
echo "Restored. Active schema: $ACTIVE_SCHEMA"
echo
echo "Set in .env.local:"
echo "  DATABASE_SCHEMA=$ACTIVE_SCHEMA"
