import { getIndexerUrl } from '~/utils/indexer'

export type PunkMarketStateResponse = {
  listed: number[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type PunkMarketStateKey = Exclude<keyof PunkMarketStateResponse, 'generated_at'>
export type PunkMarketStateSets = Record<PunkMarketStateKey, Set<number>>

function toSets(source?: PunkMarketStateResponse | null): PunkMarketStateSets {
  return {
    listed: new Set(source?.listed),
    active_bids: new Set(source?.active_bids),
    legacy_wrapped: new Set(source?.legacy_wrapped),
    wrapped: new Set(source?.wrapped),
  }
}

async function fetchPunkMarketState(): Promise<PunkMarketStateResponse | null> {
  const indexerUrl = getIndexerUrl()
  if (!indexerUrl) return null

  try {
    return await $fetch<PunkMarketStateResponse>(
      `${indexerUrl}/punks/market-state`,
    )
  } catch {
    return null
  }
}

export function usePunkMarketState() {
  const { data } = useAsyncData('punk-market-state', fetchPunkMarketState, {
    lazy: true,
    server: false,
  })

  const sets = computed(() => toSets(data.value))

  return {
    marketStateSets: sets,
  }
}
