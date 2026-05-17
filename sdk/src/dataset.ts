import type { Hex } from 'viem'
import {
  createOfflinePunksDataClient,
  createOfflinePunksDataClientFromDataset,
  type OfflinePunksDataClient,
  type OfflinePunksDataClientConfig,
  type OfflinePunksDataSource,
  type OfflinePunksDataBundle,
  type OfflinePunksSearchFacets,
} from './offline'
import type {
  ColorRef,
  PaletteColor,
  PunkBitmap,
  PunkQuery,
  PunkSummary,
  PunkSummaryOptions,
  TraitRecord,
  TraitRef,
} from './types'
import { toOfflineSearchQuery } from './query'
import { indexedPixelsToRgba } from './client'

export type PunksDatasetConfig = {
  dataset?: OfflinePunksDataSource | OfflinePunksDataBundle
}

export class PunksDataset {
  readonly source: OfflinePunksDataClient
  readonly hash: Hex

  constructor(config: PunksDatasetConfig = {}) {
    this.source =
      config.dataset === undefined
        ? createOfflinePunksDataClient()
        : createOfflinePunksDataClientFromDataset(config.dataset)
    this.hash = this.source.getDatasetHashSync()
  }

  search(query: PunkQuery = {}): number[] {
    return this.source.searchSync(toOfflineSearchQuery(query))
  }

  count(query: PunkQuery = {}): number {
    return this.source.countSync(toOfflineSearchQuery(query))
  }

  facets(query: PunkQuery = {}): OfflinePunksSearchFacets {
    return this.source.facetsSync(toOfflineSearchQuery(query))
  }

  bitmap(query: PunkQuery = {}): PunkBitmap {
    return this.source.searchBitmapSync(toOfflineSearchQuery(query))
  }

  get(punkId: number, options: PunkSummaryOptions = {}): PunkSummary {
    return this.source.getPunkSync(punkId, options)
  }

  getMany(
    punkIds: readonly number[],
    options: PunkSummaryOptions = {},
  ): PunkSummary[] {
    return this.source.getPunksSync(punkIds, options)
  }

  traits(): TraitRecord[] {
    return this.source.getTraitCatalogSync()
  }

  trait(trait: TraitRef): TraitRecord {
    return this.source.resolveTraitSync(trait)
  }

  palette(options?: { includeSupplies?: boolean }): PaletteColor[] {
    return this.source.getPaletteSync(options)
  }

  color(color: ColorRef): PaletteColor {
    return this.source.resolveColorSync(color)
  }

  indexedPixels(punkId: number): Uint8Array {
    return this.source.getIndexedPixelsSync(punkId)
  }

  rgbaPixels(punkId: number): Uint8Array {
    return indexedPixelsToRgba(
      this.indexedPixels(punkId),
      this.source.getPaletteRgbaBytesSync(),
    )
  }
}

export function createPunksDataset(
  config: PunksDatasetConfig = {},
): PunksDataset {
  return new PunksDataset(config)
}

export function offlineConfigFromDataset(
  dataset?: OfflinePunksDataSource | OfflinePunksDataBundle,
): OfflinePunksDataClientConfig {
  return dataset === undefined ? {} : { dataset }
}
