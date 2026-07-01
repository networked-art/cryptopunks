import type { Post, Renderer } from '../core'
import type { Acquisition } from './source'
import { formatEth, formatUsd, plural, PUNKS_AUCTION_URL } from './format'
import { punkGrid } from './image'
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

/// The concrete renderer service: an account's acquisition becomes a tweet —
/// a one-line caption and a grid of its whole collection with the newly-bought
/// punks enlarged to 2×2 via img-grid's `highlight`.
export class PunksRenderer implements Renderer<Acquisition> {
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

    return punkGrid(
      ids.map((id) => ({ id })),
      {
        highlight: acquisition.acquired,
        maxWidth: this.options.maxWidth,
      },
    )
  }

  private caption(acquisition: Acquisition, name: string): string {
    const lines = [
      acquisition.newCollector ? `New collector ${name}` : name,
      this.acquiredLine(acquisition),
    ]
    // A debut single-punk buy is fully described by the first two lines; in
    // every other case the running total is worth stating.
    if (!acquisition.newCollector || acquisition.acquired.length > 1) {
      lines.push(
        `Now holds ${acquisition.owned.length} ${plural(acquisition.owned.length, 'CryptoPunk')}`,
      )
    }
    lines.push(this.link(acquisition))
    return lines.join('\n')
  }

  /// A link to view the acquisition: the punk's page for a single buy, the
  /// buyer's collection for several (one tidy URL beats a wall of punk links).
  private link(acquisition: Acquisition): string {
    if (acquisition.acquired.length === 1) {
      return `${PUNKS_AUCTION_URL}/punks/${acquisition.acquired[0]}`
    }
    return `${PUNKS_AUCTION_URL}/profile/${acquisition.account.toLowerCase()}`
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
        ? ` (${formatUsd(acquisition.spentUsdCents)})`
        : ''
    return ` for ${formatEth(acquisition.spentWei)}${usd}`
  }

  private altText(acquisition: Acquisition, name: string): string {
    const acquired = acquisition.acquired.length
    return `Grid of ${name}'s ${acquisition.owned.length} CryptoPunks, with ${acquired} newly acquired ${plural(acquired, 'punk')} enlarged.`
  }
}
