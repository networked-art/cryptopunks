import { avvatarDataUri } from 'avvatars'

export const AVVATAR_GRID_SIZE = 12
export const AVVATAR_FOREGROUND = '#f7f7f8'
export const AVVATAR_BACKGROUND = '#ff5fa8'

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
