#!/usr/bin/env bash
# One-shot fork-mode startup. Idempotent — re-run any time.
#
#   1. Verifies the local hardhat fork is running on :8545 and serving
#      chainId 1 (the only thing `ponder.config.ts` accepts).
#   2. Ensures the Postgres container is up.
#   3. Restores the latest snapshot from `dumps/` if the schema is missing.
#   4. Probes Ponder for the local build_id (handlers + schema hash) and
#      stamps it into the snapshot's `_ponder_meta` so `ponder start` will
#      reuse the restored state instead of erroring with
#      `Schema "…" was previously used by a different Ponder app.`
#   5. Hands off to `ponder start`.
#
# Run `pnpm dev:fork` in `../contracts` first (separate terminal). That node
# must stay up while this is running.
set -euo pipefail

PKG_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PKG_DIR"

PG_CONTAINER="punks-indexer-db"
SNAPSHOT_SCHEMA="ponder_266dfce09b4842e9"
PROBE_SCHEMA="ponder_probe"
PROBE_LOG="/tmp/ponder-probe.$$.log"
FORK_URL="http://127.0.0.1:8545"

step() { printf '\n\033[1;36m▸\033[0m %s\n' "$1"; }
info() { printf '  %s\n' "$1"; }
fail() { printf '\n\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

psql_in() { docker exec -i "$PG_CONTAINER" psql -U punks -d punks "$@"; }

# 1. Fork reachable + recognizably a hardhat node
step "Checking fork at $FORK_URL"
CHAIN_ID_HEX=$(curl -fsS -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  "$FORK_URL" 2>/dev/null | sed -n 's/.*"result":"\([^"]*\)".*/\1/p' || true)
if [[ -z "$CHAIN_ID_HEX" ]]; then
  fail "No JSON-RPC on $FORK_URL. Start the fork: cd ../contracts && pnpm dev:fork"
fi
# Probe a hardhat-specific RPC so we don't accidentally mutate a real node.
if ! curl -fsS -X POST -H 'Content-Type: application/json' \
     --data '{"jsonrpc":"2.0","method":"hardhat_metadata","params":[],"id":1}' \
     "$FORK_URL" 2>/dev/null | grep -q '"result"'; then
  fail "RPC at $FORK_URL doesn't respond to hardhat_metadata — refusing to proceed against a non-hardhat node."
fi
BLOCK_HEX=$(curl -fsS -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  "$FORK_URL" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')
info "fork chainId=$((CHAIN_ID_HEX)), head=$((BLOCK_HEX))"

# 2. Postgres reachable
step "Checking Postgres"
if ! docker exec "$PG_CONTAINER" pg_isready -U punks -d punks >/dev/null 2>&1; then
  info "container not ready — starting"
  docker compose up -d >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$PG_CONTAINER" pg_isready -U punks -d punks >/dev/null 2>&1 && break
    sleep 1
  done
fi
info "$PG_CONTAINER is ready"

# 3. Snapshot present
SCHEMA_PRESENT=$(psql_in -tA -c "SELECT 1 FROM pg_namespace WHERE nspname='$SNAPSHOT_SCHEMA'" | tr -d '[:space:]')
if [[ "$SCHEMA_PRESENT" != "1" ]]; then
  step "Snapshot schema '$SNAPSHOT_SCHEMA' missing — restoring"
  bash "$PKG_DIR/scripts/restore-fork.sh"
else
  step "Snapshot schema '$SNAPSHOT_SCHEMA' already present"
fi

# 4. Probe local build_id
step "Probing local build_id"
psql_in -c "DROP SCHEMA IF EXISTS $PROBE_SCHEMA CASCADE" >/dev/null

DATABASE_SCHEMA="$PROBE_SCHEMA" pnpm exec ponder start >"$PROBE_LOG" 2>&1 &
PROBE_PID=$!
trap '[[ -n "${PROBE_PID:-}" ]] && kill "$PROBE_PID" 2>/dev/null || true; rm -f "$PROBE_LOG"' EXIT

LOCAL_BUILD_ID=""
for _ in $(seq 1 60); do
  if ! kill -0 "$PROBE_PID" 2>/dev/null; then
    info "probe exited prematurely — log tail:"
    tail -n 30 "$PROBE_LOG" >&2 || true
    fail "could not probe build_id"
  fi
  LOCAL_BUILD_ID=$(psql_in -tA -c "SELECT value->>'build_id' FROM ${PROBE_SCHEMA}._ponder_meta WHERE key='app'" 2>/dev/null | tr -d '[:space:]' || true)
  [[ -n "$LOCAL_BUILD_ID" ]] && break
  sleep 1
done
[[ -z "$LOCAL_BUILD_ID" ]] && fail "probe never wrote _ponder_meta within 60s"

kill "$PROBE_PID" 2>/dev/null || true
wait "$PROBE_PID" 2>/dev/null || true
trap - EXIT
rm -f "$PROBE_LOG"

info "local build_id = $LOCAL_BUILD_ID"

# 5. Patch snapshot _ponder_meta
STORED_BUILD_ID=$(psql_in -tA -c "SELECT value->>'build_id' FROM ${SNAPSHOT_SCHEMA}._ponder_meta WHERE key='app'" | tr -d '[:space:]')
if [[ "$STORED_BUILD_ID" == "$LOCAL_BUILD_ID" ]]; then
  step "build_id already matches — no patch needed"
else
  step "Patching ${SNAPSHOT_SCHEMA}._ponder_meta build_id"
  info "$STORED_BUILD_ID → $LOCAL_BUILD_ID"
fi
# Always:
#   - stamp `_ponder_meta` with the local build_id and clear is_locked
#   - zero `_ponder_checkpoint.finalized_checkpoint` and rewind
#     `latest_checkpoint` to `safe_checkpoint`. Otherwise Ponder errors with
#     "Finalized block for chain '1' cannot move backwards" — the snapshot's
#     finalized cursor sits ahead of the fork head, since prod kept advancing
#     finalization while this fork was pinned to the snapshot block. The
#     resume point is `safe_checkpoint`, not `finalized_checkpoint`, so zeroing
#     finalized is safe.
#   - trim `ponder_sync.intervals.blocks` to the snapshot's safe block. Beyond
#     that the shared sync cache references real-mainnet blocks (timestamps
#     and headers) that don't exist on our pinned fork, so Ponder would loop
#     forever in `getLocalSyncProgress` trying to fetch them.
#   - drop the probe schema.
SAFE_BLOCK=$(psql_in -tA -c \
  "SELECT substring(safe_checkpoint, 27, 16)::bigint
     FROM ${SNAPSHOT_SCHEMA}._ponder_checkpoint
    WHERE chain_id = 1
    LIMIT 1" | tr -d '[:space:]')
info "snapshot safe block = $SAFE_BLOCK (trimming sync intervals to this upper bound)"

# Trim + normalize. Ponder's `getIntervals` does `JSON.parse('[' + mr.slice(1,-1) + ']')`,
# which only succeeds when the multirange ranges use `[a,b]` (inclusive-end)
# notation. Stored prod data uses `[a,b)` (exclusive-end), so we rewrite each
# range to `[]` while we're trimming to the snapshot's safe block.
psql_in -v ON_ERROR_STOP=1 -c "
  UPDATE ${SNAPSHOT_SCHEMA}._ponder_meta
     SET value = jsonb_set(
                   jsonb_set(value, '{build_id}', to_jsonb('$LOCAL_BUILD_ID'::text)),
                   '{is_locked}', '0'::jsonb
                 )
   WHERE key='app';
  UPDATE ${SNAPSHOT_SCHEMA}._ponder_checkpoint
     SET finalized_checkpoint = repeat('0', 75),
         latest_checkpoint    = safe_checkpoint;
  UPDATE ponder_sync.intervals AS i
     SET blocks = COALESCE(
                    (SELECT range_agg(
                              numrange(
                                CASE WHEN lower_inc(r) THEN lower(r)::numeric
                                     ELSE (lower(r) + 1)::numeric END,
                                LEAST(
                                  CASE WHEN upper_inc(r) THEN upper(r)::numeric
                                       ELSE (upper(r) - 1)::numeric END,
                                  ${SAFE_BLOCK}::numeric
                                ),
                                '[]'
                              )
                            )
                       FROM unnest(i.blocks) AS r
                      WHERE lower(r) <= ${SAFE_BLOCK}::numeric),
                    '{}'::nummultirange
                  )
   WHERE chain_id = 1;
  DROP SCHEMA IF EXISTS $PROBE_SCHEMA CASCADE;
" >/dev/null

# 6. Run ponder start
step "Starting ponder against $SNAPSHOT_SCHEMA"
exec env DATABASE_SCHEMA="$SNAPSHOT_SCHEMA" pnpm exec ponder start
