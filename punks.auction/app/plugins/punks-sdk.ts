import { createPunksSdk } from '@networked-art/punks-sdk'
import { bundledOfflinePunksData } from '@networked-art/punks-sdk/offline-data'

/**
 * Offline-only SDK — search and dataset reads. The sprite sheet serves visual
 * rendering; full indexed pixel data is loaded only by the PNG download path.
 */
export default defineNuxtPlugin(() => {
  const offline = createPunksSdk({ dataset: bundledOfflinePunksData })
  return {
    provide: {
      punksOffline: offline,
      punksDataset: bundledOfflinePunksData,
    },
  }
})
