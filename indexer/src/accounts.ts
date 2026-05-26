import type { Context } from 'ponder:registry'
import { account } from 'ponder:schema'
import {
  PUNKS_VAULT_FACTORY_ADDRESS,
  PUNKS_VAULT_FACTORY_START_BLOCK,
  STASH_FACTORY_ADDRESS,
  punkVaultFactoryAbi,
  stashFactoryAbi,
} from '@networked-art/punks-sdk'
import { getAddress } from 'viem'
import type { Address } from 'viem'

import {
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_V1_ADDRESS,
  CRYPTOPUNKS_V2_ADDRESS,
  PUNKS_MARKET_ADDRESS,
  V1_WRAPPER_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  ZERO_ADDRESS,
} from '../utils/contracts'

// Addresses that are never user EOAs and should never get an `accounts` row.
// Includes our own deployments, third-party wrappers/markets, factories, and
// the zero address. Lowercased once at module load for fast lookup.
const KNOWN_NON_EOA_LOWER = new Set<string>([
  CRYPTOPUNKS_V1_ADDRESS.toLowerCase(),
  CRYPTOPUNKS_V2_ADDRESS.toLowerCase(),
  WRAPPED_PUNKS_ADDRESS.toLowerCase(),
  CRYPTOPUNKS_721_ADDRESS.toLowerCase(),
  V1_WRAPPER_ADDRESS.toLowerCase(),
  PUNKS_MARKET_ADDRESS.toLowerCase(),
  PUNKS_VAULT_FACTORY_ADDRESS.toLowerCase(),
  STASH_FACTORY_ADDRESS.toLowerCase(),
  ZERO_ADDRESS.toLowerCase(),
  // 1001 deployments outside the indexer's tracked set.
  '0xa6d304efa8c00fae128bc9a89a1d07e1e3922a9b', // PunksAuction
  '0x4121c97ddf23d457d7e039f8dd718b8527ca9a24', // PunksAuctionEscrow
  '0x6d263b22d1b2feb93881af6ff57666efa5a8f346', // UnwrapV1Punks
])

// Lowercases a viem-returned address into the form Ponder's `t.hex()` columns
// round-trip — so the compare against `existing.vault`/`existing.stash` is
// stable. Without this, `predictVault` returns checksummed and `existing.vault`
// is read back lowercase, firing a spurious UPDATE on every event for the same
// EOA.
function lower(addr: Address | null): Address | null {
  return addr ? (addr.toLowerCase() as Address) : null
}

// Pinned to `max(eventBlock, factoryDeployBlock)` so the eth_call always lands
// on a block where the factories exist, regardless of when the triggering
// event happened. The result is a pure function of `user` either way.
async function predictPair(
  context: Context,
  user: Address,
  blockNumber: bigint,
): Promise<{ vault: Address | null; stash: Address | null }> {
  const callBlock =
    blockNumber >= PUNKS_VAULT_FACTORY_START_BLOCK
      ? blockNumber
      : PUNKS_VAULT_FACTORY_START_BLOCK
  const results = await context.client.multicall({
    allowFailure: true,
    blockNumber: callBlock,
    contracts: [
      {
        address: PUNKS_VAULT_FACTORY_ADDRESS,
        abi: punkVaultFactoryAbi,
        functionName: 'predictVault',
        args: [user],
      },
      {
        address: STASH_FACTORY_ADDRESS,
        abi: stashFactoryAbi,
        functionName: 'stashAddressFor',
        args: [user],
      },
    ],
  })
  return {
    vault: lower(
      results[0]?.status === 'success' ? (results[0].result as Address) : null,
    ),
    stash: lower(
      results[1]?.status === 'success' ? (results[1].result as Address) : null,
    ),
  }
}

/**
 * Upserts an EOA into the `accounts` table, populating the deterministic
 * per-user vault and stash addresses from `PunksVaultFactory.predictVault`
 * and `StashFactory.stashAddressFor` (both pure views of the user address).
 *
 * Safe to call repeatedly: relies on Ponder's internal `db.find` cache for
 * the hot path, and never overwrites an already-populated column.
 *
 * Deliberately avoids a module-level "completed" Set: Ponder reverts DB
 * writes on reorg without resetting user module state, so a process-local
 * cache that skips re-inserts would leave subsequent `recordUserProxy`
 * updates pointing at a row the reorg already deleted.
 */
export async function ensureAccount(
  context: Context,
  address: string,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  if (KNOWN_NON_EOA_LOWER.has(address.toLowerCase())) return

  const normalized = getAddress(address) as Address
  const existing = await context.db.find(account, { address: normalized })
  if (existing?.vault && existing.stash) return

  let vault: Address | null = existing?.vault ?? null
  let stash: Address | null = existing?.stash ?? null

  const predicted = await predictPair(context, normalized, blockNumber)
  vault = vault ?? predicted.vault
  stash = stash ?? predicted.stash

  if (!existing) {
    await context.db.insert(account).values({
      address: normalized,
      vault,
      vault_deployed: false,
      stash,
      stash_deployed: false,
      user_proxy: null,
      first_seen_at: timestamp,
      updated_at: timestamp,
    })
  } else if (vault !== existing.vault || stash !== existing.stash) {
    await context.db.update(account, { address: normalized }).set({
      vault,
      stash,
      updated_at: timestamp,
    })
  }
}

/**
 * Marks `user`'s `accounts` row as having a deployed `PunksVault` at `vault`,
 * creating the row first if needed. The address is taken straight from the
 * `VaultDeployed` event so it doesn't depend on the `predictVault` view being
 * callable at the event block.
 */
export async function markVaultDeployed(
  context: Context,
  owner: string,
  vault: string,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  await ensureAccount(context, owner, blockNumber, timestamp)
  if (KNOWN_NON_EOA_LOWER.has(owner.toLowerCase())) return
  const normalized = getAddress(owner) as Address
  const vaultNormalized = vault.toLowerCase() as Address
  await context.db.update(account, { address: normalized }).set({
    vault: vaultNormalized,
    vault_deployed: true,
    updated_at: timestamp,
  })
}

/**
 * Marks `owner`'s `accounts` row as having a deployed Stash at `stash`,
 * creating the row first if needed. Caller is responsible for resolving
 * `owner` from the `Deployed(proxy, implementation)` event (typically via
 * an `eth_call` to `proxy.owner()`) since the event itself doesn't carry it.
 */
export async function markStashDeployed(
  context: Context,
  owner: string,
  stash: string,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  await ensureAccount(context, owner, blockNumber, timestamp)
  if (KNOWN_NON_EOA_LOWER.has(owner.toLowerCase())) return
  const normalized = getAddress(owner) as Address
  const stashNormalized = stash.toLowerCase() as Address
  await context.db.update(account, { address: normalized }).set({
    stash: stashNormalized,
    stash_deployed: true,
    updated_at: timestamp,
  })
}

/**
 * Convenience wrapper that ensures multiple addresses in sequence (dedup +
 * KNOWN_NON_EOA filter applied inside `ensureAccount`). Use this at the top
 * of each event handler to register every EOA the event mentions.
 */
export async function ensureAccounts(
  context: Context,
  addresses: ReadonlyArray<string | null | undefined>,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  const seen = new Set<string>()
  for (const raw of addresses) {
    if (!raw) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    await ensureAccount(context, raw, blockNumber, timestamp)
  }
}

/**
 * Records `user`'s registered `WrappedPunks` UserProxy on their `accounts`
 * row, creating the row first if needed.
 */
export async function recordUserProxy(
  context: Context,
  user: string,
  proxy: string,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  await ensureAccount(context, user, blockNumber, timestamp)
  if (KNOWN_NON_EOA_LOWER.has(user.toLowerCase())) return
  const normalized = getAddress(user) as Address
  const proxyNormalized = proxy.toLowerCase() as Address
  await context.db.update(account, { address: normalized }).set({
    user_proxy: proxyNormalized,
    updated_at: timestamp,
  })
}
