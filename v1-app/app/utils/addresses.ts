import type { Address } from 'viem'

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
