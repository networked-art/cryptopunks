export const PUNK_SPRITE_COLS = 100
export const PUNK_SPRITE_URL = 'https://cdn.punksmarket.app/punks.png'
export const PUNK_GLITCH_SPRITE_URL =
  'https://cdn.punksmarket.app/punks-glitched.png'

export function punkSpriteBackgroundStyle(
  punkId: number,
  size: number,
): Record<string, string> {
  const spriteRow = Math.floor(punkId / PUNK_SPRITE_COLS)
  const spriteCol = punkId % PUNK_SPRITE_COLS
  const spriteSize = `${PUNK_SPRITE_COLS * size}px ${PUNK_SPRITE_COLS * size}px`
  const spritePosition = `-${spriteCol * size}px -${spriteRow * size}px`

  return {
    backgroundImage: `url('${PUNK_GLITCH_SPRITE_URL}'), url('${PUNK_SPRITE_URL}')`,
    backgroundSize: `${spriteSize}, ${spriteSize}`,
    backgroundPosition: `${spritePosition}, ${spritePosition}`,
  }
}
