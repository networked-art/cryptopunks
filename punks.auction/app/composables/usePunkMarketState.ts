import { getIndexerUrl } from '~/utils/indexer'

export type PunkMarketStateResponse = {
  listed: number[]
  /// Parallel to `listed`; null entries are private (onlySellTo) listings
  /// that should be skipped by price-asc sorts.
  listed_prices: (number | null)[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type PunkMarketStateSetKey =
  | 'listed'
  | 'active_bids'
  | 'legacy_wrapped'
  | 'wrapped'
export type PunkMarketStateSets = Record<PunkMarketStateSetKey, Set<number>>

export type PunkMarketLocalPatch = {
  legacy_wrapped?: boolean
  wrapped?: boolean
}

function withId(arr: number[], id: number, present: boolean): number[] {
  const idx = arr.indexOf(id)
  if (present) {
    if (idx !== -1) return arr
    return [...arr, id].sort((a, b) => a - b)
  }
  if (idx === -1) return arr
  return arr.slice(0, idx).concat(arr.slice(idx + 1))
}

const IDLE_LOAD_TIMEOUT_MS = 1_500

let fetchPromise: Promise<PunkMarketStateResponse | null> | null = null
let idleLoadScheduled = false

function toSets(source?: PunkMarketStateResponse | null): PunkMarketStateSets {
  return {
    listed: new Set(source?.listed),
    active_bids: new Set(source?.active_bids),
    legacy_wrapped: new Set(source?.legacy_wrapped),
    wrapped: new Set(source?.wrapped),
  }
}

function toListedPrices(
  source?: PunkMarketStateResponse | null,
): Map<number, number> {
  const map = new Map<number, number>()
  const ids = source?.listed
  const prices = source?.listed_prices
  if (!ids || !prices) return map
  const length = Math.min(ids.length, prices.length)
  for (let i = 0; i < length; i++) {
    const price = prices[i]
    if (price == null) continue
    map.set(ids[i]!, price)
  }
  return map
}

async function fetchPunkMarketState(
  fresh = false,
): Promise<PunkMarketStateResponse | null> {
  const indexerUrl = getIndexerUrl()
  if (!indexerUrl) return null

  try {
    return await $fetch<PunkMarketStateResponse>(
      `${indexerUrl}/punks/market-state`,
      fresh ? { query: { fresh: 1 } } : undefined,
    )
  } catch {
    return null
  }
}

function sharedFetchPunkMarketState(force = false) {
  if (!force && fetchPromise) return fetchPromise
  fetchPromise = fetchPunkMarketState(force).finally(() => {
    fetchPromise = null
  })
  return fetchPromise
}

function scheduleIdleLoad(load: () => void) {
  if (idleLoadScheduled) return
  idleLoadScheduled = true

  const run = () => {
    idleLoadScheduled = false
    load()
  }

  type IdleWindow = Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number
  }
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(run, { timeout: IDLE_LOAD_TIMEOUT_MS })
    return
  }
  window.setTimeout(run, 0)
}

export function usePunkMarketState() {
  const data = useState<PunkMarketStateResponse | null>(
    'punk-market-state',
    () => null,
  )
  const loaded = useState('punk-market-state-loaded', () => false)
  const pending = useState('punk-market-state-pending', () => false)

  async function load(force = false) {
    if (import.meta.server) return
    if (!force && (loaded.value || pending.value)) return

    pending.value = true
    try {
      const next = await sharedFetchPunkMarketState(force)
      if (next) {
        data.value = next
        loaded.value = true
      }
    } finally {
      pending.value = false
    }
  }

  if (import.meta.client) {
    onMounted(() => scheduleIdleLoad(() => void load()))
  }

  const sets = computed(() => toSets(data.value))
  const listedPrices = computed(() => toListedPrices(data.value))

  /// Optimistically toggle wrapper membership for a single Punk so consumers
  /// (bg colors, sort buckets) reflect the new state immediately after a
  /// wrap/unwrap is mined. The next `refreshMarketState` reconciles against
  /// the indexer truth, so a miscoded transition self-corrects within ~15s.
  function applyPunkLocal(punkId: number, patch: PunkMarketLocalPatch) {
    const current = data.value
    if (!current) return
    const next = { ...current }
    if (patch.legacy_wrapped !== undefined) {
      next.legacy_wrapped = withId(
        current.legacy_wrapped,
        punkId,
        patch.legacy_wrapped,
      )
    }
    if (patch.wrapped !== undefined) {
      next.wrapped = withId(current.wrapped, punkId, patch.wrapped)
    }
    data.value = next
  }

  return {
    marketState: data,
    marketStateLoaded: loaded,
    marketStatePending: pending,
    marketStateSets: sets,
    listedPrices,
    refreshMarketState: () => load(true),
    applyPunkLocal,
  }
}

/// Per-caller staging slot for an optimistic patch: stage it when the action
/// starts, then either flush on success or discard on failure. Keeps the
/// `apply-on-success` / `roll-back-on-error` wiring out of every action site.
export function useOptimisticMarketPatch() {
  const { applyPunkLocal } = usePunkMarketState()
  const pending = ref<{ punkId: number; patch: PunkMarketLocalPatch } | null>(
    null,
  )

  function stage(punkId: number, patch: PunkMarketLocalPatch) {
    pending.value = { punkId, patch }
  }

  function flush() {
    const next = pending.value
    if (!next) return
    applyPunkLocal(next.punkId, next.patch)
    pending.value = null
  }

  function discard() {
    pending.value = null
  }

  return { stage, flush, discard }
}
