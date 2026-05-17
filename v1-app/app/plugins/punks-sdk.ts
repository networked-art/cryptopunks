import { createPunksSdk } from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'

/**
 * Offline-only SDK + the source bundle. The bundle is reused by
 * `usePunksSdk()` when re-creating an onchain-bound SDK on wallet changes.
 */
export default defineNuxtPlugin(() => {
  const offline = createPunksSdk({ dataset: bundledOfflinePunksDataWithPixels })
  return {
    provide: {
      punksOffline: offline,
      punksDataset: bundledOfflinePunksDataWithPixels,
    },
  }
})
