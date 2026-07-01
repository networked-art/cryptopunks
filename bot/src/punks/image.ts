import {
  createPunkImageRenderer,
  createPunksDataset,
  PUNK_WIDTH,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { grid, type Img } from '@visualizevalue/img-grid'

/// One tile in the grid. V1 tokens are drawn on the dark V1 background the
/// punks.auction app uses, so a punk-and-its-V1 pair reads as two tokens
/// rather than a duplicated image.
export interface PunkTile {
  id: number
  v1?: boolean
}

export interface PunkGridOptions {
  /// Punk ids blown up to 2×2 feature tiles. Must be a subset of the tiles.
  highlight?: number[]
  /// Forwarded to the grid renderer as its target width in pixels.
  maxWidth?: number
}

// The off-white the grid sits on: img-grid paints it into the margin, the
// gutters between tiles, and any trailing gaps in an imperfect pack. The punk
// tiles keep their own `#638596` field (drawn by the SDK), so they read as
// framed tiles on the light canvas rather than blending into it.
const GRID_BACKGROUND = '#f0f0f3'

// img-grid's own default output width, mirrored here so the padding and gutter
// can be sized as fractions of the output even when GRID_MAX_WIDTH is unset.
const DEFAULT_MAX_WIDTH = 1920

// Margin around the whole grid, per side, as a fraction of the output width.
const PADDING_FRACTION = 0.16

// The punks.auction app's background for V1 tokens (PUNK_BACKGROUNDS.v1).
const V1_BACKGROUND = '#444444'

// The default offline dataset omits pixel data; the with-pixels bundle is
// what lets the renderer produce punk images without a chain or image host.
const punks = createPunkImageRenderer(
  createPunksDataset({ dataset: bundledOfflinePunksDataWithPixels }),
)

/// A PNG grid of the given punk tiles, drawn offline by the SDK and composed
/// via img-grid — no chain or image host involved.
export async function punkGrid(
  tiles: PunkTile[],
  options: PunkGridOptions = {},
): Promise<Buffer> {
  const images: Img[] = tiles.map((tile) => ({
    id: String(tile.id),
    url: punks.pngDataUri(tile.id, {
      background: tile.v1 ? V1_BACKGROUND : 'default',
    }),
  }))

  const highlight = options.highlight ?? []
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH
  const padding = Math.round(maxWidth * PADDING_FRACTION)
  // Each highlighted punk fills a 2×2 block, i.e. 3 cells beyond its own.
  const cells = images.length + highlight.length * 3

  return grid(images, {
    highlight: highlight.map(String),
    maxWidth,
    background: GRID_BACKGROUND,
    padding,
    gutter: gutter(cells, maxWidth, padding),
    // Punks are 24×24 pixel art; nearest-neighbour keeps them crisp when the
    // grid scales a cell up rather than blurring the pixels.
    pixelated: true,
  })
}

/// A gutter one punk-pixel wide at the scale tiles are drawn — 1/PUNK_WIDTH of
/// a column. img-grid sizes columns internally from the layout it picks, so we
/// approximate the column width from a near-square column count; the gutter is
/// thin enough that landing a column or two off doesn't show.
function gutter(cells: number, maxWidth: number, padding: number): number {
  const columns = Math.max(1, Math.round(Math.sqrt(cells)))
  const columnWidth = (maxWidth - 2 * padding) / columns
  return Math.max(1, Math.round(columnWidth / PUNK_WIDTH))
}
