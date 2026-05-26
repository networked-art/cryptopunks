import { computed, watch, type Ref } from 'vue'

type OfferPlaceTargetSearchOptions = {
  enableOwnerSearch?: boolean
}

export function useOfferPlaceTargetSearch(
  text: Ref<string>,
  options: OfferPlaceTargetSearchOptions = {},
) {
  const search = usePunkSearch({
    initialText: text.value,
    syncRoute: false,
    enableListedFilter: false,
    enableMarketQualifiers: false,
    enableOwnerSearch: options.enableOwnerSearch ?? false,
    enableEnterNavigation: false,
  })

  const searchText = computed({
    get: () => search.text.value,
    set: (next: string) => {
      search.text.value = next
    },
  })
  const ids = computed(() => search.ids.value)

  watch(text, (next) => {
    if (search.text.value !== next) search.text.value = next
  })

  watch(search.text, (next) => {
    if (text.value !== next) text.value = next
  })

  return {
    searchText,
    debouncedText: search.debouncedText,
    ids,
    offerQuery: search.offerQuery,
  }
}
