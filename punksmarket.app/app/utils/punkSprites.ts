export const PUNK_SPRITE_COLS = 100
export const PUNK_SPRITE_URL =
  'https://cdn.punksmarket.app/punks.optimized.png?v=20260525-3'
export const PUNK_GLITCH_OUTLINE_SPRITE_URL =
  'https://cdn.punksmarket.app/punks-glitch-outline.png?v=20260525-3'
export const PUNK_GLITCH_STRIPES_SPRITE_URL =
  'https://cdn.punksmarket.app/punks-glitch-stripes.png?v=20260525-3'

export type PunkSpriteLayerOptions = {
  stripes?: boolean
  outline?: boolean
}

export function punkSpriteBackgroundStyle(
  punkId: number,
  size: number,
  layers: PunkSpriteLayerOptions = {},
): Record<string, string> {
  const spriteRow = Math.floor(punkId / PUNK_SPRITE_COLS)
  const spriteCol = punkId % PUNK_SPRITE_COLS
  const spriteSize = `${PUNK_SPRITE_COLS * size}px ${PUNK_SPRITE_COLS * size}px`
  const spritePosition = `-${spriteCol * size}px -${spriteRow * size}px`
  const backgroundImages = [`url('${PUNK_SPRITE_URL}')`]

  if (layers.outline) {
    backgroundImages.unshift(`url('${PUNK_GLITCH_OUTLINE_SPRITE_URL}')`)
  }
  if (layers.stripes) {
    backgroundImages.unshift(`url('${PUNK_GLITCH_STRIPES_SPRITE_URL}')`)
  }

  const backgroundCount = backgroundImages.length
  const backgroundSize = Array(backgroundCount).fill(spriteSize).join(', ')
  const backgroundPosition = Array(backgroundCount)
    .fill(spritePosition)
    .join(', ')

  return {
    backgroundImage: backgroundImages.join(', '),
    backgroundSize,
    backgroundPosition,
  }
}
