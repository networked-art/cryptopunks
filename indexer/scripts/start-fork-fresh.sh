#!/usr/bin/env bash
# Fresh-schema fork-mode startup. Use this when local schema/handlers have
# drifted from the snapshot so `pnpm start:fork`'s crash recovery against
# the snapshot schema would fail with missing columns or tables.
#
# Doesn't touch the snapshot. Indexes into a separate `ponder_local` schema,
# replaying handlers over the hot `ponder_sync` cache that the snapshot
# restore already populated. Only new sources (e.g. contracts added since
# the snapshot was taken) and the small post-snapshot block delta hit the
# fork's upstream RPC.
#
# Re-runnable. If handlers/schema haven't changed since the last boot,
# the existing `ponder_local` is reused via crash recovery; otherwise it
# gets dropped and rebuilt.
#
# Prereqs: `pnpm restore:fork` (populates `ponder_sync` cache + snapshot
# schema we read `safe_block` from) and `pnpm dev:fork` in `../contracts`.
set -euo pipefail

PKG_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PKG_DIR"

PG_CONTAINER="punks-indexer-db"
SNAPSHOT_SCHEMA="ponder_a645aeb52bc45799"
LOCAL_SCHEMA="ponder_local"
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

# 3. Snapshot schema is the source of truth for the safe block we trim
# `ponder_sync.intervals` to. If it's missing, the cache is in an unknown
# state — bail and tell the user to restore.
SNAPSHOT_PRESENT=$(psql_in -tA -c "SELECT 1 FROM pg_namespace WHERE nspname='$SNAPSHOT_SCHEMA'" | tr -d '[:space:]')
if [[ "$SNAPSHOT_PRESENT" != "1" ]]; then
  fail "Snapshot schema '$SNAPSHOT_SCHEMA' missing — run \`pnpm restore:fork\` first to populate the ponder_sync cache."
fi
SAFE_BLOCK=$(psql_in -tA -c \
  "SELECT substring(safe_checkpoint, 27, 16)::bigint
     FROM ${SNAPSHOT_SCHEMA}._ponder_checkpoint
    WHERE chain_id = 1
    LIMIT 1" | tr -d '[:space:]')
info "snapshot safe block = $SAFE_BLOCK"

# 4. Trim + normalize `ponder_sync.intervals` to the snapshot's safe block.
# Same logic as `start-fork.sh`: intersect each cached range with
# `[lo, SAFE_BLOCK]`, rewrite to `[]` form so Ponder's JSON.parse works.
# Idempotent — re-running on already-trimmed intervals is a no-op.
step "Trimming ponder_sync.intervals to safe block (idempotent)"
psql_in -v ON_ERROR_STOP=1 -c "
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
" >/dev/null

# 5. Decide whether to reuse or drop $LOCAL_SCHEMA. Reuse only when its
# stored build_id matches what local source currently computes — otherwise
# Ponder would reject the schema with "previously used by a different
# Ponder app". Probe by booting Ponder against a throwaway schema and
# reading the build_id it stamps into `_ponder_meta`.
LOCAL_PRESENT=$(psql_in -tA -c "SELECT 1 FROM pg_namespace WHERE nspname='$LOCAL_SCHEMA'" | tr -d '[:space:]')
META_PRESENT=""
if [[ "$LOCAL_PRESENT" == "1" ]]; then
  META_PRESENT=$(psql_in -tA -c "SELECT 1 FROM information_schema.tables WHERE table_schema='$LOCAL_SCHEMA' AND table_name='_ponder_meta'" | tr -d '[:space:]')
fi

if [[ "$META_PRESENT" == "1" ]]; then
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

  STORED_BUILD_ID=$(psql_in -tA -c "SELECT value->>'build_id' FROM ${LOCAL_SCHEMA}._ponder_meta WHERE key='app'" | tr -d '[:space:]')
  psql_in -c "DROP SCHEMA IF EXISTS $PROBE_SCHEMA CASCADE" >/dev/null

  if [[ "$STORED_BUILD_ID" == "$LOCAL_BUILD_ID" ]]; then
    info "build_id $LOCAL_BUILD_ID matches — reusing '$LOCAL_SCHEMA' via crash recovery"
    # `_ponder_checkpoint` may sit ahead of the fork head from the last boot's
    # tail, same hazard as the snapshot path. Zero finalized + rewind latest
    # to safe so Ponder doesn't error with "Finalized block cannot move
    # backwards", and clear `is_locked` so we don't wait out the heartbeat.
    psql_in -v ON_ERROR_STOP=1 -c "
      UPDATE ${LOCAL_SCHEMA}._ponder_meta
         SET value = jsonb_set(value, '{is_locked}', '0'::jsonb)
       WHERE key='app';
      UPDATE ${LOCAL_SCHEMA}._ponder_checkpoint
         SET finalized_checkpoint = repeat('0', 75),
             latest_checkpoint    = safe_checkpoint;
    " >/dev/null
  else
    step "Dropping '$LOCAL_SCHEMA' (build_id changed: $STORED_BUILD_ID → $LOCAL_BUILD_ID)"
    psql_in -c "DROP SCHEMA IF EXISTS $LOCAL_SCHEMA CASCADE" >/dev/null
  fi
else
  if [[ "$LOCAL_PRESENT" == "1" ]]; then
    step "Dropping partially-initialized '$LOCAL_SCHEMA'"
    psql_in -c "DROP SCHEMA IF EXISTS $LOCAL_SCHEMA CASCADE" >/dev/null
  else
    step "No existing '$LOCAL_SCHEMA' — Ponder will index fresh against the ponder_sync cache"
  fi
fi

# 6. Run ponder start
step "Starting ponder against $LOCAL_SCHEMA"
exec env DATABASE_SCHEMA="$LOCAL_SCHEMA" pnpm exec ponder start
