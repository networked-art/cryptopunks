import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { getIndexerUrl } from '~/utils/indexer'
import { PUNK_BACKGROUNDS } from '~/utils/render'

export type PunkBackgroundsResponse = {
  listed: number[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type PunkBackgroundKey = Exclude<keyof PunkBackgroundsResponse, 'generated_at'>
type PunkBackgroundSets = Record<PunkBackgroundKey, Set<number>>

const BACKGROUND_PRIORITY = [
  ['wrapped', PUNK_BACKGROUNDS.wrapped],
  ['legacy_wrapped', PUNK_BACKGROUNDS.legacyWrapped],
  ['listed', PUNK_BACKGROUNDS.listed],
  ['active_bids', PUNK_BACKGROUNDS.activeBid],
] as const

function toSets(source?: PunkBackgroundsResponse | null): PunkBackgroundSets {
  return {
    listed: new Set(source?.listed),
    active_bids: new Set(source?.active_bids),
    legacy_wrapped: new Set(source?.legacy_wrapped),
    wrapped: new Set(source?.wrapped),
  }
}

async function fetchPunkBackgrounds(): Promise<PunkBackgroundsResponse | null> {
  const indexerUrl = getIndexerUrl()
  if (!indexerUrl) return null

  try {
    return await $fetch<PunkBackgroundsResponse>(
      `${indexerUrl}/punks/backgrounds`,
    )
  } catch {
    return null
  }
}

export function usePunkBackgrounds() {
  const { data } = useAsyncData('punk-backgrounds', fetchPunkBackgrounds, {
    lazy: true,
    server: false,
  })

  const sets = computed(() => toSets(data.value))

  function backgroundForPunk(
    punkId: number,
    standard: TokenStandardValue = TokenStandard.CryptoPunks,
  ): string {
    if (standard !== TokenStandard.CryptoPunks) return PUNK_BACKGROUNDS.default

    for (const [key, color] of BACKGROUND_PRIORITY) {
      if (sets.value[key].has(punkId)) return color
    }

    return PUNK_BACKGROUNDS.default
  }

  return {
    backgroundForPunk,
  }
}
