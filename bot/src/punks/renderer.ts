import {
  createPunkImageRenderer,
  createPunksDataset,
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  type PunkImageRenderer,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { grid, type Img } from '@visualizevalue/img-grid'
import type { Post, Renderer } from '../core'
import type { Acquisition } from './source'
import { formatEth, formatUsd, plural } from './format'
import type { NameResolver } from './names'

export interface PunksRendererOptions {
  names: NameResolver
  /// Skip acquisitions whose total spend is below this — the punk analogue of
  /// the EVM bot's sub-$5 filter. Omit to post every sale.
  minSpendWei?: bigint
  /// Forwarded to the grid renderer as its target width in pixels.
  maxWidth?: number
  /// How many acquired ids to spell out in the caption before summarizing the
  /// rest as "+N more". Defaults to 6.
  maxListedIds?: number
}

const DEFAULT_MAX_LISTED_IDS = 6

// The classic punk background (`#638596`), derived from the same SDK constant
// the tiles are painted with. Passing it to the grid makes any cell a tile
// doesn't fill (trailing gaps in an imperfect pack) blend with the artwork
// instead of showing img-grid's default black.
const GRID_BACKGROUND = `#${PUNKS_RENDERER_BACKGROUND_DEFAULT.slice(2, 8)}`

/// The concrete renderer service: an account's acquisition becomes a tweet —
/// a one-line caption and a grid of its whole collection with the newly-bought
/// punks enlarged to 2×2 via img-grid's `highlight`. Punk artwork is produced
/// offline by the SDK and handed to img-grid as `data:` URIs, so no chain or
/// image host is involved.
export class PunksRenderer implements Renderer<Acquisition> {
  // The default offline dataset omits pixel data; the with-pixels bundle is
  // what lets the renderer produce punk images without a chain or image host.
  private readonly punks: PunkImageRenderer = createPunkImageRenderer(
    createPunksDataset({ dataset: bundledOfflinePunksDataWithPixels }),
  )

  constructor(private readonly options: PunksRendererOptions) {}

  async render(acquisition: Acquisition): Promise<Post | null> {
    if (acquisition.acquired.length === 0) return null
    if (
      this.options.minSpendWei &&
      acquisition.spentWei < this.options.minSpendWei
    ) {
      return null
    }

    const name = await this.options.names.resolve(acquisition.account)
    const image = await this.grid(acquisition)

    return {
      text: this.caption(acquisition, name),
      media: {
        data: image,
        mimeType: 'image/png',
        alt: this.altText(acquisition, name),
      },
    }
  }

  private async grid(acquisition: Acquisition): Promise<Buffer> {
    const acquired = new Set(acquisition.acquired)
    // Acquired ids first so they read as the feature tiles, then the rest of the
    // collection ascending.
    const ids = [
      ...acquisition.acquired,
      ...acquisition.owned.filter((id) => !acquired.has(id)),
    ]

    const images: Img[] = ids.map((id) => ({
      id: String(id),
      url: this.punks.pngDataUri(id, { background: 'default' }),
    }))

    return grid(images, {
      highlight: acquisition.acquired.map(String),
      maxWidth: this.options.maxWidth,
      background: GRID_BACKGROUND,
      // Punks are 24×24 pixel art; nearest-neighbour keeps them crisp when the
      // grid scales a cell up rather than blurring the pixels.
      pixelated: true,
    })
  }

  private caption(acquisition: Acquisition, name: string): string {
    const lines = [
      acquisition.newCollector ? `New collector — ${name}` : name,
      this.acquiredLine(acquisition),
    ]
    // A debut single-punk buy is fully described by the first two lines; in
    // every other case the running total is worth stating.
    if (!acquisition.newCollector || acquisition.acquired.length > 1) {
      lines.push(
        `Now holds ${acquisition.owned.length} ${plural(acquisition.owned.length, 'CryptoPunk')}`,
      )
    }
    return lines.join('\n')
  }

  private acquiredLine(acquisition: Acquisition): string {
    const price = this.priceText(acquisition)
    const ids = acquisition.acquired
    if (ids.length === 1) return `Acquired CryptoPunk #${ids[0]}${price}`

    const limit = this.options.maxListedIds ?? DEFAULT_MAX_LISTED_IDS
    const listed = ids
      .slice(0, limit)
      .map((id) => `#${id}`)
      .join(', ')
    const more = ids.length > limit ? `, +${ids.length - limit} more` : ''
    return `Acquired ${ids.length} CryptoPunks (${listed}${more})${price}`
  }

  private priceText(acquisition: Acquisition): string {
    if (acquisition.spentWei <= 0n) return ''
    const usd =
      acquisition.spentUsdCents !== null
        ? ` — ${formatUsd(acquisition.spentUsdCents)}`
        : ''
    return ` (${formatEth(acquisition.spentWei)}${usd})`
  }

  private altText(acquisition: Acquisition, name: string): string {
    const acquired = acquisition.acquired.length
    return `Grid of ${name}'s ${acquisition.owned.length} CryptoPunks, with ${acquired} newly acquired ${plural(acquired, 'punk')} enlarged.`
  }
}
