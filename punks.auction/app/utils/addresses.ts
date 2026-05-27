import type { Address } from 'viem'
import {
  CRYPTOPUNKS_MARKET_ADDRESS,
  CRYPTOPUNKS_V1_ADDRESS,
  PUNKS_VAULT_FACTORY_ADDRESS as SDK_PUNKS_VAULT_FACTORY_ADDRESS,
  STASH_FACTORY_ADDRESS as SDK_STASH_FACTORY_ADDRESS,
  WRAPPED_PUNKS_ADDRESS as SDK_WRAPPED_PUNKS_ADDRESS,
} from '@networked-art/punks-sdk'

/** Mainnet `PunksAuction` — the zero-fee auction house. */
export const PUNKS_AUCTION_ADDRESS =
  '0xA6D304EFA8c00fAE128Bc9A89a1D07E1E3922A9b' as Address

/** First block containing the `PunksAuction` deployment. */
export const PUNKS_AUCTION_START_BLOCK = 25_146_787n

/** Canonical `CryptoPunks` market (the fixed June 22nd 2017 redeploy). */
export const CRYPTOPUNKS_ADDRESS = CRYPTOPUNKS_MARKET_ADDRESS as Address

/** The original June 9th 2017 `CryptoPunks` market. */
export const PUNKS_V1_ADDRESS = CRYPTOPUNKS_V1_ADDRESS as Address

/** `PunksVaultFactory` — deploys deterministic per-user `PunksVault` clones. */
export const PUNKS_VAULT_FACTORY_ADDRESS = SDK_PUNKS_VAULT_FACTORY_ADDRESS

/** Yuga Labs `StashFactory` — deploys deterministic per-user `Stash` clones. */
export const STASH_FACTORY_ADDRESS = SDK_STASH_FACTORY_ADDRESS

/** Original `WrappedCryptopunks` — also the per-user `WrapperProxy` registry. */
export const WRAPPED_PUNKS_ADDRESS = SDK_WRAPPED_PUNKS_ADDRESS
