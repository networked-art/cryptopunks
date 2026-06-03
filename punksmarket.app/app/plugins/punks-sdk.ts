import {
  createPunksSdk,
  CRYPTOPUNKS_V1_ADDRESS,
  PunkStandard,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { PUNKS_MARKET_ADDRESS } from '~/utils/addresses'

/**
 * Offline-only SDK + the source bundle. The bundle is reused by
 * `usePunksSdk()` when re-creating an onchain-bound SDK on wallet changes.
 *
 * `addresses.market` is pinned to the Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ contract — this app never talks
 * to the canonical market. `addresses.v1Market` is the new `PunksMarket.sol`
 * (collection bid book + bug-aware settlement).
 *
 * `standard` scopes curated-collection search to this market's standard, so the
 * canonical-only sets (`burned`, `museum`, Perfect & Priceless) don't resolve
 * as id filters here.
 */
export default defineNuxtPlugin(() => {
  const offline = createPunksSdk({
    dataset: bundledOfflinePunksDataWithPixels,
    standard: PunkStandard.CryptoPunksV1,
    addresses: {
      market: CRYPTOPUNKS_V1_ADDRESS,
      v1Market: PUNKS_MARKET_ADDRESS,
    },
  })
  return {
    provide: {
      punksOffline: offline,
      punksDataset: bundledOfflinePunksDataWithPixels,
    },
  }
})
