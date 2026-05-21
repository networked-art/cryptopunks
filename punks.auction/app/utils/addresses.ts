import type { Address } from 'viem'
import {
  CRYPTOPUNKS_MARKET_ADDRESS,
  CRYPTOPUNKS_V1_ADDRESS,
  ZERO_ADDRESS,
} from '@networked-art/punks-sdk'

/**
 * Mainnet `PunksAuction` — the zero-fee auction house.
 *
 * TODO: `PunksAuction` is not deployed yet. Replace this placeholder with the
 * real address once it is live. Until then `isAuctionDeployed()` is false and
 * the list/detail pages render an empty "not deployed" state.
 */
export const PUNKS_AUCTION_ADDRESS = ZERO_ADDRESS as Address

/**
 * Block `PunksAuction` was deployed at — the lower bound for `eth_getLogs`
 * scans. TODO: set to the real deployment block alongside the address above.
 */
export const PUNKS_AUCTION_DEPLOY_BLOCK = 0n

/** Canonical `CryptoPunks` market (the fixed June 22nd 2017 redeploy). */
export const CRYPTOPUNKS_ADDRESS = CRYPTOPUNKS_MARKET_ADDRESS as Address

/** The original June 9th 2017 `CryptoPunks` market. */
export const PUNKS_V1_ADDRESS = CRYPTOPUNKS_V1_ADDRESS as Address

/** True once `PUNKS_AUCTION_ADDRESS` points at a real deployment. */
export function isAuctionDeployed(): boolean {
  return PUNKS_AUCTION_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
}
