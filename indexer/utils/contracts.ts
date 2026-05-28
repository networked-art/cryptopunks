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

export const PUNKS_MARKET_ADDRESS =
  '0x64e507FEBF26521b73FbdfA533106B2042533218' as const
export const PUNKS_MARKET_START_BLOCK = 25_118_216

export const PUNKS_AUCTION_ADDRESS =
  '0xA6D304EFA8c00fAE128Bc9A89a1D07E1E3922A9b' as const
export const PUNKS_AUCTION_START_BLOCK = 25_146_787

// PunksAuctionEscrow — deployed by `PunksAuction`'s constructor; custodies
// Punks during live auctions. Settlement shuffles each Punk
// escrow → auction → recipient through the canonical markets, so the V1/V2
// handlers suppress activity rows touching either address (the canonical
// per-item events come from `PunksAuction` itself).
export const PUNKS_AUCTION_ESCROW_ADDRESS =
  '0x4121c97DDf23d457D7E039f8dd718B8527Ca9A24' as const

// PunksVaultFactory — deploys deterministic per-user `PunksVault` clones.
// Watched so we can mark `accounts.vault_deployed = true` when a user (or a
// third party on their behalf) actually deploys their vault. The address
// column is still populated counterfactually via `predictVault` on first
// sight in `src/accounts.ts`.
export const PUNKS_VAULT_FACTORY_ADDRESS =
  '0xf3381B259B2FE142c0A87bffF463695d935D6F66' as const
export const PUNKS_VAULT_FACTORY_START_BLOCK = 25_103_673

// StashFactory (Yuga Labs) — emits `Deployed(proxy, implementation)` from
// `ERC1967Factory` each time `deployStash` clones a new Stash. The owner
// isn't on the event, so the handler reads `proxy.owner()` to map the new
// Stash back to its EOA.
export const STASH_FACTORY_ADDRESS =
  '0x000000000000A6fA31F5fC51c1640aAc76866750' as const
export const STASH_FACTORY_START_BLOCK = 19_029_676

// Chainlink ETH/USD aggregator (OCR). Not indexed via Ponder — we read it
// from API-context code with Viem and write the result into the offchain
// `eth_usd_prices` table for persistence across redeploys. The consumer-
// facing proxy at 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419 does not expose
// round-by-round reads; the aggregator below does.
export const CHAINLINK_ETH_USD_AGGREGATOR =
  '0x37bC7498f4FF12C19678ee8fE19d713b87F6a9e6' as const
export const CHAINLINK_ETH_USD_AGGREGATOR_START_BLOCK = 12_382_429n

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
