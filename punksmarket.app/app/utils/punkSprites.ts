export const PUNK_SPRITE_COLS = 100
export const PUNK_SPRITE_URL = 'https://cdn.punksmarket.app/punks.optimized.png'
export const PUNK_GLITCH_OUTLINE_SPRITE_URL =
  'https://cdn.punksmarket.app/punks-glitch-outline.png'
export const PUNK_GLITCH_STRIPES_SPRITE_URL =
  'https://cdn.punksmarket.app/punks-glitch-stripes.png'

export type PunkSpriteLayerOptions = {
  stripes?: boolean
  outline?: boolean
}

/// Pixel-based sprite slice for fixed-size thumbnails. Multiple layers stack
/// stripes → outline → base so the optional glitch sheets paint over the
/// punk; missing layers gracefully fall through to the base sprite.
export function punkSpriteBackgroundStyle(
  punkId: number,
  size: number,
  layers: PunkSpriteLayerOptions = {},
): Record<string, string> {
  const spriteRow = Math.floor(punkId / PUNK_SPRITE_COLS)
  const spriteCol = punkId % PUNK_SPRITE_COLS
  const spriteSize = `${PUNK_SPRITE_COLS * size}px ${PUNK_SPRITE_COLS * size}px`
  const spritePosition = `-${spriteCol * size}px -${spriteRow * size}px`
  return composeSpriteStyle(spriteSize, spritePosition, layers)
}

/// Percent-based equivalent for tiles that scale to whatever box a CSS grid
/// hands them — used by the mosaic on bid cards so the punk picks up the
/// stripes / outline glitch layers like everywhere else in the app.
export function punkSpriteFluidStyle(
  punkId: number,
  layers: PunkSpriteLayerOptions = {},
): Record<string, string> {
  const SPAN = PUNK_SPRITE_COLS - 1
  const spriteRow = Math.floor(punkId / PUNK_SPRITE_COLS)
  const spriteCol = punkId % PUNK_SPRITE_COLS
  const spriteSize = `${PUNK_SPRITE_COLS * 100}% ${PUNK_SPRITE_COLS * 100}%`
  const spritePosition = `${(spriteCol / SPAN) * 100}% ${(spriteRow / SPAN) * 100}%`
  return composeSpriteStyle(spriteSize, spritePosition, layers)
}

function composeSpriteStyle(
  spriteSize: string,
  spritePosition: string,
  layers: PunkSpriteLayerOptions,
): Record<string, string> {
  const backgroundImages = [`url('${PUNK_SPRITE_URL}')`]
  if (layers.outline) {
    backgroundImages.unshift(`url('${PUNK_GLITCH_OUTLINE_SPRITE_URL}')`)
  }
  if (layers.stripes) {
    backgroundImages.unshift(`url('${PUNK_GLITCH_STRIPES_SPRITE_URL}')`)
  }
  const count = backgroundImages.length
  return {
    backgroundImage: backgroundImages.join(', '),
    backgroundSize: Array(count).fill(spriteSize).join(', '),
    backgroundPosition: Array(count).fill(spritePosition).join(', '),
  }
}
