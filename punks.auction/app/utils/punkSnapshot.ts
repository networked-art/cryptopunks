import type { PunksSdk } from '@networked-art/punks-sdk'
import { PUNK_BACKGROUNDS } from '~/utils/render'

/// Renders a Punk to a PNG and triggers a browser download. The image comes
/// from the SDK's full pixel dataset, which is imported only on demand.

export type SnapshotOptions = {
  size?: number
  background?: string
  fileName?: string
}

let pixelSdkPromise: Promise<PunksSdk> | null = null

async function getPixelSdk(): Promise<PunksSdk> {
  if (!pixelSdkPromise) {
    pixelSdkPromise = Promise.all([
      import('@networked-art/punks-sdk'),
      import('@networked-art/punks-sdk/offline-pixel-data'),
    ]).then(([sdk, data]) =>
      sdk.createPunksSdk({ dataset: data.bundledOfflinePunksDataWithPixels }),
    )
  }
  return pixelSdkPromise
}

async function svgToBlob(svg: string, size: number): Promise<Blob> {
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  const img = new Image()
  img.decoding = 'sync'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load punk SVG'))
    img.src = dataUri
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, size, size)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob returned null'))
    }, 'image/png')
  })
}

export async function downloadPunkPng(
  punkId: number,
  options: SnapshotOptions = {},
): Promise<void> {
  const size = options.size ?? 1024
  const fileName = options.fileName ?? `punk-${punkId}.png`
  const pixelSdk = await getPixelSdk()
  const svg = pixelSdk.render.svg(punkId, {
    background: (options.background ??
      PUNK_BACKGROUNDS.default) as `#${string}`,
  })
  const blob = await svgToBlob(svg, size)

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
