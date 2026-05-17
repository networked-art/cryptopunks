import type { Address } from 'viem'

/**
 * Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ V1 wrapper (ERC-721). When a Punk is wrapped the raw V1
 * market reports this contract as the owner; the canonical holder is the
 * ERC-721 token owner read from this contract's `ownerOf`.
 */
export const V1_WRAPPER_ADDRESS =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as Address

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
