import {
  createPunksSdk,
  CRYPTOPUNKS_V1_ADDRESS,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { usePunksMarketAddress } from '~/utils/addresses'

/**
 * Offline-only SDK + the source bundle. The bundle is reused by
 * `usePunksSdk()` when re-creating an onchain-bound SDK on wallet changes.
 *
 * `addresses.market` is pinned to the Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ contract — this app never talks
 * to the canonical market. `addresses.v1Market` is the new `PunksMarket.sol`
 * (collection bid book + bug-aware settlement), sourced from runtime config.
 */
export default defineNuxtPlugin(() => {
  const punksMarket = usePunksMarketAddress().value ?? undefined
  const offline = createPunksSdk({
    dataset: bundledOfflinePunksDataWithPixels,
    addresses: {
      market: CRYPTOPUNKS_V1_ADDRESS,
      v1Market: punksMarket,
    },
  })
  return {
    provide: {
      punksOffline: offline,
      punksDataset: bundledOfflinePunksDataWithPixels,
    },
  }
})
