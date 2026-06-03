import type { Address } from 'viem'

export function useActivitySearchScope() {
  const {
    text: searchText,
    debouncedText: debouncedSearchText,
    placeholder: searchPlaceholder,
    ownerHandle: searchOwnerHandle,
    ownerAddress: searchOwnerAddress,
    ids: searchIds,
    counts: searchCounts,
    suggestions: searchSuggestions,
    onEnter: onSearchEnter,
    clearSearch,
  } = usePunkSearch({
    syncRoute: true,
    enableListedFilter: false,
    enableEnterNavigation: false,
    debounceMs: 300,
  })

  const hasSearchInput = computed(() => searchText.value.trim().length > 0)
  const hasSearch = computed(() => debouncedSearchText.value.trim().length > 0)
  const searchPanelOpen = ref(searchText.value.trim().length > 0)
  const isAddressSearch = computed(
    () => hasSearch.value && !!searchOwnerHandle.value,
  )
  const searchAddress = computed<Address | undefined>(() =>
    isAddressSearch.value ? searchOwnerAddress.value : undefined,
  )
  const searchPunkIds = computed<readonly number[] | undefined>(() => {
    if (!hasSearch.value) return undefined
    if (isAddressSearch.value) return searchAddress.value ? undefined : []
    return searchIds.value
  })

  watch(hasSearchInput, (active) => {
    if (active) searchPanelOpen.value = true
  })

  function toggleSearchPanel() {
    searchPanelOpen.value = !searchPanelOpen.value
  }

  function clearSearchPanel() {
    clearSearch()
    searchPanelOpen.value = false
  }

  return {
    searchText,
    debouncedSearchText,
    searchPlaceholder,
    searchOwnerHandle,
    searchAddress,
    searchPunkIds,
    searchCounts,
    searchSuggestions,
    hasSearchInput,
    hasSearch,
    searchPanelOpen,
    onSearchEnter,
    clearSearch,
    toggleSearchPanel,
    clearSearchPanel,
  }
}
