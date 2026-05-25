#!/usr/bin/env bash
# Boots a long-running `hardhat node` using the `hardhatMainnet` fork config
# from `hardhat.config.ts`, waits for JSON-RPC, then runs `seed-fork.ts` to
# transfer Punks from the test seller wallets to jalil.eth. The node keeps
# running until Ctrl-C; re-run `pnpm seed:fork` against the live node to
# re-seed (idempotent — already-transferred Punks are skipped).
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PKG_DIR"

LOG_DIR="${PKG_DIR}/.dev-fork"
mkdir -p "$LOG_DIR"
NODE_LOG="${LOG_DIR}/node.log"
RPC_URL="http://127.0.0.1:8545"

NODE_PID=""
cleanup() {
  if [[ -n "$NODE_PID" ]] && kill -0 "$NODE_PID" 2>/dev/null; then
    echo
    echo "Stopping hardhat node (pid $NODE_PID)…"
    kill "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting hardhat node — fork of mainnet @ block 25171056"
echo "  log: $NODE_LOG"
pnpm exec hardhat node --network hardhatMainnet \
  >"$NODE_LOG" 2>&1 &
NODE_PID=$!

echo -n "Waiting for RPC on $RPC_URL "
for _ in $(seq 1 120); do
  if curl -fsS -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$RPC_URL" >/dev/null 2>&1; then
    echo "— ready."
    break
  fi
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo
    echo "hardhat node exited before RPC became ready. Tail of $NODE_LOG:"
    tail -n 40 "$NODE_LOG" || true
    exit 1
  fi
  echo -n "."
  sleep 1
done

echo
echo "Seeding fork — transferring Punks to jalil.eth…"
pnpm exec hardhat run scripts/seed-fork.ts --network localhost

echo
echo "Fork node ready on $RPC_URL — Ctrl-C to stop."
wait "$NODE_PID"
