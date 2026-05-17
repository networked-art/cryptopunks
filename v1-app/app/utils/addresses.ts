import { CRYPTOPUNKS_MARKET_ADDRESS } from '@networked-art/punks-sdk'
import type { Address } from 'viem'

/** V1 CryptoPunks (the bugged 2017 market) — mainnet. */
export const PUNKS_V1_ADDRESS: Address = CRYPTOPUNKS_MARKET_ADDRESS

/**
 * Address of our `PunksMarket.sol` (the wrapping market + collection bid book).
 * Comes from runtime config — left blank until the contract is deployed.
 */
export function usePunksMarketAddress() {
  const config = useRuntimeConfig()
  const fromConfig = ((config.public as Record<string, unknown>)
    .punksMarketAddress ?? '') as string
  return computed<Address | null>(() => {
    if (!fromConfig || fromConfig === '0x' || fromConfig.length < 42)
      return null
    return fromConfig as Address
  })
}
