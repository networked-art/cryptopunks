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

// In-process cache of addresses whose vault + stash are already populated.
// Skips repeated DB finds and RPC reads for hot accounts within a single
// indexer process. Cleared on restart; the DB find covers cold starts.
const completedAddresses = new Set<string>()

function shouldSkip(lower: string): boolean {
  return KNOWN_NON_EOA_LOWER.has(lower) || completedAddresses.has(lower)
}

async function predictPair(
  context: Context,
  user: Address,
  blockNumber: bigint,
): Promise<{ vault: Address | null; stash: Address | null }> {
  try {
    const results = await context.client.multicall({
      allowFailure: true,
      blockNumber,
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
      vault: results[0]?.status === 'success' ? (results[0].result as Address) : null,
      stash: results[1]?.status === 'success' ? (results[1].result as Address) : null,
    }
  } catch {
    return { vault: null, stash: null }
  }
}

/**
 * Upserts an EOA into the `accounts` table. On first sight at or after the
 * vault factory's deploy block, multicalls `PunksVaultFactory.predictVault`
 * and `StashFactory.stashAddressFor` (both pure views) to populate the
 * deterministic per-user vault and stash addresses. Earlier sightings store
 * the row with `vault` / `stash` NULL; the next post-deploy sighting
 * backfills them.
 *
 * Safe to call repeatedly: deduplicates via an in-process set plus a DB find,
 * and never overwrites an already-populated column.
 */
export async function ensureAccount(
  context: Context,
  address: string,
  blockNumber: bigint,
  timestamp: bigint,
): Promise<void> {
  const lower = address.toLowerCase()
  if (shouldSkip(lower)) return

  const normalized = getAddress(address) as Address
  const existing = await context.db.find(account, { address: normalized })
  if (existing?.vault && existing.stash) {
    completedAddresses.add(lower)
    return
  }

  let { vault, stash } = existing
    ? { vault: existing.vault, stash: existing.stash }
    : { vault: null as Address | null, stash: null as Address | null }

  if (blockNumber >= PUNKS_VAULT_FACTORY_START_BLOCK) {
    const predicted = await predictPair(context, normalized, blockNumber)
    vault = vault ?? predicted.vault
    stash = stash ?? predicted.stash
  }

  if (!existing) {
    await context.db.insert(account).values({
      address: normalized,
      vault,
      stash,
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

  if (vault && stash) completedAddresses.add(lower)
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
    const lower = raw.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
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
  const lower = user.toLowerCase()
  if (KNOWN_NON_EOA_LOWER.has(lower)) return
  const normalized = getAddress(user) as Address
  const proxyNormalized = getAddress(proxy) as Address
  await context.db.update(account, { address: normalized }).set({
    user_proxy: proxyNormalized,
    updated_at: timestamp,
  })
}
