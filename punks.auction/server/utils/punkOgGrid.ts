import {
  createPunkImageRenderer,
  createPunksDataset,
  PUNK_WIDTH,
  type PunkImageRenderer,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { grid, type Img } from '@visualizevalue/img-grid'

const GRID_BACKGROUND = '#f0f0f3'
const GRID_MAX_WIDTH = 630
const GRID_PADDING = Math.round(GRID_MAX_WIDTH * 0.16)
const BLANK_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E'

let renderer: PunkImageRenderer | null = null

function punks(): PunkImageRenderer {
  renderer ??= createPunkImageRenderer(
    createPunksDataset({ dataset: bundledOfflinePunksDataWithPixels }),
  )
  return renderer
}

export async function renderPunkOgGrid(ids: number[]) {
  const images: Img[] = ids.map((id) => ({
    id: String(id),
    url: punks().pngDataUri(id, { background: 'default' }),
  }))
  const gridImages = squarePaddedImages(images)
  const { padding, gutter } = gridSpacing(gridImages.length)

  return await grid(gridImages, {
    maxWidth: GRID_MAX_WIDTH,
    background: GRID_BACKGROUND,
    padding,
    gutter,
    pixelated: true,
  })
}

function squarePaddedImages(images: Img[]): Img[] {
  const columns = gridColumns(images.length)
  const rows = Math.ceil(images.length / columns)
  const total = Math.max(columns, rows) ** 2

  return [
    ...images,
    ...Array.from({ length: total - images.length }, (_, i) => ({
      id: `blank-${i}`,
      url: BLANK_IMAGE,
    })),
  ]
}

function gridSpacing(cells: number): { padding: number; gutter: number } {
  const columns = gridColumns(cells)
  const availableWidth = GRID_MAX_WIDTH - 2 * GRID_PADDING
  const scale = Math.max(
    1,
    Math.floor(availableWidth / (columns * PUNK_WIDTH + columns - 1)),
  )

  const cellSize = PUNK_WIDTH * scale
  let gutter = scale
  let contentWidth = columns * cellSize + (columns - 1) * gutter

  if (
    contentWidth <= availableWidth &&
    (availableWidth - contentWidth) % 2 !== 0 &&
    contentWidth + columns - 1 <= availableWidth
  ) {
    gutter += 1
    contentWidth = columns * cellSize + (columns - 1) * gutter
  }

  return {
    padding: Math.max(
      GRID_PADDING,
      Math.floor((GRID_MAX_WIDTH - contentWidth) / 2),
    ),
    gutter,
  }
}

function gridColumns(cells: number): number {
  if (cells <= 1) return 1

  let bestColumns = 1
  let bestScore: [number, number, number] | null = null

  for (let columns = 1; columns <= Math.ceil(Math.sqrt(cells)) + 2; columns++) {
    const rows = Math.ceil(cells / columns)
    const score: [number, number, number] = [
      Math.max(columns, rows),
      columns * rows - cells,
      -columns,
    ]

    if (!bestScore || lexLess(score, bestScore)) {
      bestColumns = columns
      bestScore = score
    }
  }

  return bestColumns
}

function lexLess(a: [number, number, number], b: [number, number, number]) {
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (left !== right) return left < right
  }
  return false
}
