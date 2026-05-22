import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { PUNK_BACKGROUNDS } from '~/utils/render'

const BACKGROUND_PRIORITY = [
  ['wrapped', PUNK_BACKGROUNDS.wrapped],
  ['legacy_wrapped', PUNK_BACKGROUNDS.legacyWrapped],
  ['listed', PUNK_BACKGROUNDS.listed],
  ['active_bids', PUNK_BACKGROUNDS.activeBid],
] as const

export function usePunkBackgrounds() {
  const { marketStateSets } = usePunkMarketState()

  function backgroundForPunk(
    punkId: number,
    standard: TokenStandardValue = TokenStandard.CryptoPunks,
  ): string {
    if (standard !== TokenStandard.CryptoPunks) return PUNK_BACKGROUNDS.default

    for (const [key, color] of BACKGROUND_PRIORITY) {
      if (marketStateSets.value[key].has(punkId)) return color
    }

    return PUNK_BACKGROUNDS.default
  }

  return { backgroundForPunk }
}
