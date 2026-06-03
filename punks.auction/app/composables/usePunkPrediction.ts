import type { InjectionKey } from 'vue'
import type { TokenStandardValue } from '~/utils/auction'
import { fetchPunkPrediction } from '~/utils/predictions'

// Loads the full market-model prediction for a single Punk from the indexer
// `/predictions` API, refetching when the Punk or its standard changes. Lazy so
// it never blocks the page — details fill in once resolved and are simply absent
// when the model has none.
export function usePunkPrediction(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue>,
) {
  const id = computed(() => toValue(punkId))
  const std = computed(() => toValue(standard))
  // Client-only: a lazy SSR fetch would serialize a not-yet-resolved `null`
  // into the payload and the client would never refetch, leaving the section
  // hidden. This matches how the rest of the indexer-backed detail data loads.
  const { data: prediction, pending } = useLazyAsyncData(
    () => fetchPunkPrediction(id.value, std.value),
    { watch: [id, std], default: () => null, server: false },
  )
  return { prediction, pending }
}

export type PunkPredictionState = ReturnType<typeof usePunkPrediction>

const PUNK_PREDICTION_KEY: InjectionKey<PunkPredictionState> =
  Symbol('punk-prediction')

// A single Punk-detail prediction load, shared across the page (the value-
// estimate section, etc.) so they don't each refetch.
export function providePunkPrediction(state: PunkPredictionState) {
  provide(PUNK_PREDICTION_KEY, state)
}

export function usePunkPredictionContext(): PunkPredictionState {
  const state = inject(PUNK_PREDICTION_KEY)
  if (!state) {
    throw new Error('usePunkPredictionContext requires providePunkPrediction')
  }
  return state
}
