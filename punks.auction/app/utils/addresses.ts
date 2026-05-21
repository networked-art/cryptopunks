import type { Address } from 'viem'
import {
  CRYPTOPUNKS_MARKET_ADDRESS,
  CRYPTOPUNKS_V1_ADDRESS,
  ZERO_ADDRESS,
} from '@networked-art/punks-sdk'

/** Mainnet `PunksAuction` — the zero-fee auction house. */
export const PUNKS_AUCTION_ADDRESS =
  '0xA6D304EFA8c00fAE128Bc9A89a1D07E1E3922A9b' as Address

/** Canonical `CryptoPunks` market (the fixed June 22nd 2017 redeploy). */
export const CRYPTOPUNKS_ADDRESS = CRYPTOPUNKS_MARKET_ADDRESS as Address

/** The original June 9th 2017 `CryptoPunks` market. */
export const PUNKS_V1_ADDRESS = CRYPTOPUNKS_V1_ADDRESS as Address

/** True once `PUNKS_AUCTION_ADDRESS` points at a real deployment. */
export function isAuctionDeployed(): boolean {
  return PUNKS_AUCTION_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
}
