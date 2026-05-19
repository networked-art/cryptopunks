import { getAddress, isAddress } from 'viem'

// CryptoPunks V1 — the original buggy contract. Tracked independently from
// V2 because live V1 wrapper/market activity still occurs after V2 launch.
export const CRYPTOPUNKS_V1_ADDRESS =
  '0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D' as const
export const CRYPTOPUNKS_V1_START_BLOCK = 3_842_489

// CryptoPunks V2 — canonical normal CryptoPunks contract. Indexing begins at
// the V2 deployment block. V1 continues independently in `v1_punks`.
export const CRYPTOPUNKS_V2_ADDRESS =
  '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB' as const
export const CRYPTOPUNKS_V2_START_BLOCK = 3_914_495

// Wrapped CryptoPunks — the original ERC-721 wrapper around V2 (~July 2020).
export const WRAPPED_PUNKS_ADDRESS =
  '0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6' as const
export const WRAPPED_PUNKS_START_BLOCK = 10_416_025

// CryptoPunks721 — modern ERC-721 wrapper around V2 (~late 2024).
export const CRYPTOPUNKS_721_ADDRESS =
  '0x000000000000003607fce1aC9E043a86675C5C2F' as const
export const CRYPTOPUNKS_721_START_BLOCK = 20_900_000

// V1 ERC-721 wrapper around the original buggy contract.
export const V1_WRAPPER_ADDRESS =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as const
export const V1_WRAPPER_START_BLOCK = 14_022_431

export const DEPLOYED_PUNKS_MARKET_ADDRESS =
  '0x64e507FEBF26521b73FbdfA533106B2042533218' as const
export const DEPLOYED_PUNKS_MARKET_START_BLOCK = 25_118_216

export const PUNKS_MARKET_ADDRESS = readAddressEnv(
  'PUNKS_MARKET_ADDRESS',
  DEPLOYED_PUNKS_MARKET_ADDRESS,
)

export const PUNKS_MARKET_START_BLOCK = readIntEnv(
  'PUNKS_MARKET_START_BLOCK',
  DEPLOYED_PUNKS_MARKET_START_BLOCK,
)

// Chainlink ETH/USD aggregator (OCR). Not indexed via Ponder — we read it
// from API-context code with Viem and write the result into the offchain
// `eth_usd_prices` table for persistence across redeploys. The consumer-
// facing proxy at 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419 does not expose
// round-by-round reads; the aggregator below does.
export const CHAINLINK_ETH_USD_AGGREGATOR =
  '0x37bC7498f4FF12C19678ee8fE19d713b87F6a9e6' as const

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

// Lowercase address set for fast wrapper detection in handlers.
export const WRAPPER_ADDRESSES_LOWER = new Set<string>([
  WRAPPED_PUNKS_ADDRESS.toLowerCase(),
  CRYPTOPUNKS_721_ADDRESS.toLowerCase(),
])

export type WrapperKind = 'wrapped_punks' | 'cryptopunks_721'

export function wrapperKindFor(address: string): WrapperKind | null {
  const lower = address.toLowerCase()
  if (lower === WRAPPED_PUNKS_ADDRESS.toLowerCase()) return 'wrapped_punks'
  if (lower === CRYPTOPUNKS_721_ADDRESS.toLowerCase()) return 'cryptopunks_721'
  return null
}

function readAddressEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = process.env[name]
  if (!value) return fallback
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid address`)
  }
  return getAddress(value)
}

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}
