import { createPunksSdk } from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'

/**
 * Offline-only SDK — search, dataset, and rendering. The collection itself is
 * served entirely from the bundled dataset; chain state (auctions, lots,
 * offers, ownership) is read straight from contracts in the composables.
 */
export default defineNuxtPlugin(() => {
  const offline = createPunksSdk({ dataset: bundledOfflinePunksDataWithPixels })
  return {
    provide: {
      punksOffline: offline,
    },
  }
})
