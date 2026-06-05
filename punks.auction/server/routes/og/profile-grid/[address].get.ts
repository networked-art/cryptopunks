import {
  createPunkImageRenderer,
  createPunksDataset,
  PUNK_WIDTH,
  type PunkImageRenderer,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksDataWithPixels } from '@networked-art/punks-sdk/offline-pixel-data'
import { grid, type Img } from '@visualizevalue/img-grid'
import { loadProfileOgData } from '~/utils/profileOg'

const GRID_BACKGROUND = '#f0f0f3'
const GRID_MAX_WIDTH = 630
const PADDING_FRACTION = 0.16
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

let renderer: PunkImageRenderer | null = null

function punks(): PunkImageRenderer {
  renderer ??= createPunkImageRenderer(
    createPunksDataset({ dataset: bundledOfflinePunksDataWithPixels }),
  )
  return renderer
}

export default defineEventHandler(async (event) => {
  const address = getRouterParam(event, 'address') ?? ''
  const profile = await loadProfileOgData(address)
  if (!profile || profile.ids.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No profile Punk grid',
    })
  }

  const images: Img[] = profile.ids.map((id) => ({
    id: String(id),
    url: punks().pngDataUri(id, { background: 'default' }),
  }))
  const padding = Math.round(GRID_MAX_WIDTH * PADDING_FRACTION)
  const body = await grid(images, {
    maxWidth: GRID_MAX_WIDTH,
    background: GRID_BACKGROUND,
    padding,
    gutter: gutter(images.length, GRID_MAX_WIDTH, padding),
    pixelated: true,
  })

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'cache-control', CACHE_CONTROL)
  return body
})

function gutter(cells: number, maxWidth: number, padding: number): number {
  const columns = Math.max(1, Math.round(Math.sqrt(cells)))
  const columnWidth = (maxWidth - 2 * padding) / columns
  return Math.max(1, Math.round(columnWidth / PUNK_WIDTH))
}
