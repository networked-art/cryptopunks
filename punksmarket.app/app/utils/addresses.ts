import type { Address } from 'viem'

/**
 * Mainnet `PunksMarket.sol` — the wrapping market + collection bid book.
 * Immutable, deployed once; not configurable at runtime.
 */
export const PUNKS_MARKET_ADDRESS =
  '0x64e507FEBF26521b73FbdfA533106B2042533218' as Address
