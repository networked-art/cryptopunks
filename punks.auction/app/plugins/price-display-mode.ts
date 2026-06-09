import {
  parsePriceDisplayMode,
  usePriceDisplayMode,
} from '~/composables/usePriceDisplay'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  const { setMode } = usePriceDisplayMode()

  function applyCurrencyQuery(value: unknown) {
    const nextMode = parsePriceDisplayMode(value)
    if (nextMode) setMode(nextMode)
  }

  applyCurrencyQuery(route.query.currency)

  if (import.meta.client) {
    watch(
      () => route.query.currency,
      (value) => applyCurrencyQuery(value),
    )
  }
})
