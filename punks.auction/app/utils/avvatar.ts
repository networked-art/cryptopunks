import { avvatarDataUri } from 'avvatars'

export const AVVATAR_GRID_SIZE = 24
export const AVVATAR_FOREGROUND = '#ff5fa8'
export const AVVATAR_BACKGROUND = '#ffffff'

export function accountAvvatarDataUri(seed: string, size: number) {
  return avvatarDataUri({
    seed: seed.toLowerCase(),
    size,
    gridSize: AVVATAR_GRID_SIZE,
    foreground: AVVATAR_FOREGROUND,
    background: AVVATAR_BACKGROUND,
    optimized: true,
  })
}
