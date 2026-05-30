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
import type { PunkStandardRef } from './constants'

export type PunksDatasetConfig = {
  dataset?: OfflinePunksDataSource | OfflinePunksDataBundle
  /// Scopes curated-collection text resolution to a single Punk standard,
  /// forwarded to the offline client. Omitted resolves every collection.
  standard?: PunkStandardRef
}

export class PunksDataset {
  readonly source: OfflinePunksDataClient
  readonly hash: Hex

  constructor(config: PunksDatasetConfig = {}) {
    this.source =
      config.dataset === undefined
        ? createOfflinePunksDataClient({ standard: config.standard })
        : createOfflinePunksDataClientFromDataset(config.dataset, {
            standard: config.standard,
          })
    this.hash = this.source.getDatasetHashSync()
  }

  search(query: PunkQuery = {}): number[] {
    return this.source.searchSync(toOfflineSearchQuery(query))
  }

  count(query: PunkQuery = {}): number {
    return this.source.countSync(toOfflineSearchQuery(query))
  }

  /// Rewrites unfinished, unambiguous terms in `text` to the alias they complete
  /// to (`bur` → `burned`), matching how {@link search} resolves them. Lets a UI
  /// keep a collection explainer in step with the grid. See
  /// {@link OfflinePunksDataClient.completeSearchText}.
  completeSearchText(text: string): string {
    return this.source.completeSearchText(text)
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
