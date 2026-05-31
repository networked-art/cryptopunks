import type { PunksSdk } from '@networked-art/punks-sdk'
import { WRAPPED_BG } from '~/composables/useWrappedPunks'

/// Builds a frozen "glitched" SVG of a punk and rasterizes it to a PNG.
/// The composition mirrors `PunkImage.vue` (base pixels + three RGB
/// channel-offset layers with screen blend, slice clip, and a per-channel
/// skew) but at a single deterministic pose per punk — animation can't be
/// captured into a still, so we pick one expressive frame instead.

export type SnapshotBackground = 'classic' | 'transparent' | 'wrapped' | string

export type SnapshotOptions = {
  size?: number
  background?: SnapshotBackground
  strength?: number
  fileName?: string
  /// Selects the frozen pose. Each channel samples one of its keyframe
  /// frames from this seed, so a fresh seed lands on a different glitch
  /// position. Defaults to `punkId` (deterministic per punk).
  seed?: number
}

const PUNK_UNIT = 24
const HERO_PX = 320
const PX_TO_UNIT = PUNK_UNIT / HERO_PX

/// A channel's chromatic fringe (the two colored drop-shadows in
/// PunkImage.vue) is static; only the layer's translate/skew/clip animate.
/// `frames` are the @keyframes vertices each channel passes through, so
/// sampling one per channel lands the still on a real animation pose.
/// `axis` mirrors the skewX/skewY split in the original keyframes.
type Frame = {
  tx: number
  ty: number
  skew: number
  clipTop: number
  clipBottom: number
}

type Channel = {
  color1: string
  color2: string
  fringe1: { dx: number; dy: number }
  fringe2: { dx: number; dy: number }
  axis: 'x' | 'y'
  frames: Frame[]
}

const CHANNELS: Channel[] = [
  {
    color1: '#ff003c',
    color2: '#ff0066',
    fringe1: { dx: 5, dy: 0 },
    fringe2: { dx: -2, dy: 0 },
    axis: 'x',
    frames: [
      { tx: -3, ty: 1, skew: -4, clipTop: 0, clipBottom: 78 },
      { tx: 5, ty: -3, skew: 6, clipTop: 12, clipBottom: 55 },
      { tx: -4, ty: 2, skew: -3, clipTop: 40, clipBottom: 22 },
      { tx: 6, ty: -1, skew: 5, clipTop: 60, clipBottom: 8 },
      { tx: -2, ty: 3, skew: -6, clipTop: 82, clipBottom: 0 },
    ],
  },
  {
    color1: '#00ff8c',
    color2: '#00ffa6',
    fringe1: { dx: -5, dy: 0 },
    fringe2: { dx: 2, dy: 1 },
    axis: 'x',
    frames: [
      { tx: -5, ty: 0, skew: 3, clipTop: 68, clipBottom: 4 },
      { tx: 3, ty: 2, skew: -5, clipTop: 2, clipBottom: 70 },
      { tx: -2, ty: -3, skew: 4, clipTop: 35, clipBottom: 35 },
      { tx: 4, ty: 3, skew: -2, clipTop: 20, clipBottom: 55 },
      { tx: -4, ty: -2, skew: 6, clipTop: 55, clipBottom: 20 },
    ],
  },
  {
    color1: '#00b8ff',
    color2: '#3366ff',
    fringe1: { dx: 0, dy: 4 },
    fringe2: { dx: 3, dy: -2 },
    axis: 'y',
    frames: [
      { tx: 4, ty: 3, skew: -2, clipTop: 0, clipBottom: 48 },
      { tx: -3, ty: -4, skew: 3, clipTop: 45, clipBottom: 12 },
      { tx: -5, ty: -5, skew: -3, clipTop: 25, clipBottom: 60 },
      { tx: 3, ty: 5, skew: 2, clipTop: 58, clipBottom: 5 },
      { tx: 6, ty: -1, skew: -4, clipTop: 48, clipBottom: 25 },
    ],
  },
]

/// Per-channel seed multipliers, matching the freezeR/G/B seeds in
/// PunkImage.vue so the channels pick frames independently of one another.
const FRAME_SEEDS = [
  { mul: 41, add: 5 },
  { mul: 53, add: 6 },
  { mul: 67, add: 7 },
]

const SHAKE = { dx: 3, dy: -2 }

function hash32(n: number) {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

function resolveBackground(bg: SnapshotBackground | undefined) {
  if (bg === undefined || bg === 'transparent') return undefined
  if (bg === 'classic') return '#638596'
  if (bg === 'wrapped') return WRAPPED_BG
  return bg
}

export function buildGlitchedPunkSvg(
  offline: PunksSdk,
  punkId: number,
  options: SnapshotOptions = {},
): string {
  const seed = options.seed ?? punkId
  const amp = 0.7 + hash32(seed * 7 + 1) * 0.7
  const strength = (options.strength ?? 1) * amp
  const bg = resolveBackground(options.background)

  const pixelSvg = offline.render.svg(punkId, { background: 'transparent' })
  /// Strip the outer <svg ...> wrapper so we can embed the pixel rects
  /// directly. Nested <image href="data:image/svg+xml,..."> inside an SVG
  /// loaded via new Image() is fragile across browsers; inlined rects
  /// render reliably.
  const innerOpen = pixelSvg.indexOf('>')
  const pixelGroup =
    `<g id="pnk-pixels">` +
    pixelSvg.slice(innerOpen + 1, pixelSvg.lastIndexOf('</svg>')) +
    `</g>`
  const pixelRef = `<use href="#pnk-pixels"/>`

  const filters: string[] = []
  const clips: string[] = []
  const layers: string[] = []

  CHANNELS.forEach((c, i) => {
    const s = FRAME_SEEDS[i]!
    const frameIndex = Math.min(
      c.frames.length - 1,
      Math.floor(hash32(seed * s.mul + s.add) * c.frames.length),
    )
    const frame = c.frames[frameIndex]!

    const dx1 = c.fringe1.dx * strength * PX_TO_UNIT
    const dy1 = c.fringe1.dy * strength * PX_TO_UNIT
    const dx2 = c.fringe2.dx * strength * PX_TO_UNIT
    const dy2 = c.fringe2.dy * strength * PX_TO_UNIT
    const filterId = `pnk-f-${i}`
    const clipId = `pnk-c-${i}`

    const y = (frame.clipTop / 100) * PUNK_UNIT
    const h = ((100 - frame.clipTop - frame.clipBottom) / 100) * PUNK_UNIT

    filters.push(
      `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feFlood flood-color="${c.color1}" result="t1"/>` +
        `<feComposite in="t1" in2="SourceGraphic" operator="in" result="m1"/>` +
        `<feOffset in="m1" dx="${dx1.toFixed(4)}" dy="${dy1.toFixed(4)}" result="s1"/>` +
        `<feFlood flood-color="${c.color2}" result="t2"/>` +
        `<feComposite in="t2" in2="SourceGraphic" operator="in" result="m2"/>` +
        `<feOffset in="m2" dx="${dx2.toFixed(4)}" dy="${dy2.toFixed(4)}" result="s2"/>` +
        `<feMerge><feMergeNode in="s1"/><feMergeNode in="s2"/><feMergeNode in="SourceGraphic"/></feMerge>` +
        `</filter>`,
    )

    clips.push(
      `<clipPath id="${clipId}"><rect x="0" y="${y.toFixed(4)}" width="${PUNK_UNIT}" height="${h.toFixed(4)}"/></clipPath>`,
    )

    const skewFn = c.axis === 'x' ? `skewX(${frame.skew})` : `skewY(${frame.skew})`
    const tx = frame.tx * strength * PX_TO_UNIT
    const ty = frame.ty * strength * PX_TO_UNIT

    layers.push(
      `<g clip-path="url(#${clipId})" style="mix-blend-mode:screen;opacity:0.95">` +
        `<g transform="translate(${PUNK_UNIT / 2} ${PUNK_UNIT / 2}) ${skewFn} translate(${(-PUNK_UNIT / 2 + tx).toFixed(4)} ${(-PUNK_UNIT / 2 + ty).toFixed(4)})" filter="url(#${filterId})">` +
        pixelRef +
        `</g>` +
        `</g>`,
    )
  })

  const shakeTx = SHAKE.dx * strength * PX_TO_UNIT
  const shakeTy = SHAKE.dy * strength * PX_TO_UNIT

  const frameClipId = 'pnk-frame'

  /// The CSS `.is-glitching` slice clip is an animation that briefly hides
  /// a horizontal band each cycle. Baking it into a still leaves a
  /// permanent gap, so we skip it here — the channel layers carry enough
  /// glitch character on their own.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PUNK_UNIT} ${PUNK_UNIT}" shape-rendering="crispEdges">` +
    `<defs>` +
    pixelGroup +
    filters.join('') +
    clips.join('') +
    `<clipPath id="${frameClipId}"><rect x="0" y="0" width="${PUNK_UNIT}" height="${PUNK_UNIT}"/></clipPath>` +
    `</defs>` +
    (bg
      ? `<rect width="${PUNK_UNIT}" height="${PUNK_UNIT}" fill="${bg}"/>`
      : '') +
    `<g clip-path="url(#${frameClipId})">` +
    `<g transform="translate(${shakeTx.toFixed(4)} ${shakeTy.toFixed(4)})">` +
    pixelRef +
    `</g>` +
    layers.join('') +
    `</g>` +
    `</svg>`
  )
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
  offline: PunksSdk,
  punkId: number,
  options: SnapshotOptions = {},
): Promise<void> {
  const size = options.size ?? 1024
  const fileName = options.fileName ?? `punk-${punkId}.png`
  const svg = buildGlitchedPunkSvg(offline, punkId, options)
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
