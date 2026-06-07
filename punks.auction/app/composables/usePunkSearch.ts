import { refDebounced, useMediaQuery } from '@vueuse/core'
import {
  activeSearchToken,
  suggestAddressLabels,
  tokenizeSearchText,
  type PunkQuery,
  type SearchSuggestion,
  type SearchTextTerm,
} from '@networked-art/punks-sdk'
import { isAddress, type Address } from 'viem'
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  extractPunkSearchQualifiers,
  intersectIds,
  parsePunkSearchText,
  punkSearchResolvesToCollection,
  resolvePunkSearchOwnerHandle,
  unionIds,
} from '~/utils/punkSearch'

type PunkSearchOptions = {
  baseQuery?: MaybeRefOrGetter<PunkQuery | undefined>
  syncRoute?: boolean
  enableListedFilter?: boolean
  enableMarketQualifiers?: boolean
  enableOwnerSearch?: boolean
  enableEnterNavigation?: boolean
  enableSuggestions?: boolean
  initialText?: string
  debounceMs?: number
}

/// A typeahead row. SDK suggestions (trait / collection / skin-tone / count)
/// plus app-only rows for on-chain qualifiers and curated owner labels.
export type PunkSuggestion = Omit<SearchSuggestion, 'kind'> & {
  kind: SearchSuggestion['kind'] | 'market' | 'owner'
}

/// Market qualifiers live in the app, not the SDK: they resolve against
/// on-chain market state, not the dataset. `insert` is the canonical phrase
/// the parser understands; `aliases` mirror the looser phrases accepted by
/// `extractPunkSearchQualifiers`.
const MARKET_QUALIFIERS: {
  label: string
  insert: string
  aliases: string[]
}[] = [
  {
    label: 'For sale',
    insert: 'for sale',
    aliases: ['on sale', 'sale', 'listed', 'listing', 'listings'],
  },
  { label: 'Wrapped', insert: 'wrapped', aliases: ['wrap', 'wrapper'] },
  {
    label: 'Legacy wrapped',
    insert: 'legacy wrapped',
    aliases: ['legacy wrapper', 'wrapped legacy', 'wrapped punks'],
  },
  {
    label: 'Modern wrapped',
    insert: 'modern wrapped',
    aliases: ['erc721', 'erc 721', 'cryptopunks 721', 'wrapped modern'],
  },
  {
    label: 'Has bids',
    insert: 'has bids',
    aliases: ['bid', 'bids', 'with bids', 'active bids'],
  },
]

function marketSuggestions(text: string): PunkSuggestion[] {
  const token = activeSearchToken(text)
  if (token === undefined) return []
  const activeVariants = suggestionTextVariants(token.active)
  if (!hasMinimumSignal(activeVariants, 2)) return []
  const preceding = tokenizeSearchText(token.preceding)
  return MARKET_QUALIFIERS.flatMap((q) => {
    if (isBareWrappedScopeWord(q.insert, token.preceding, activeVariants)) {
      return []
    }
    const match = bestMatchedPhrase(
      [q.insert, ...q.aliases],
      activeVariants,
      preceding,
    )
    if (match === undefined) return []
    return [
      {
        kind: 'market',
        label: q.label,
        query: completeSuggestionQuery(preceding, q.insert, match.absorbed),
      },
    ]
  })
}

function isBareWrappedScopeWord(
  insert: string,
  preceding: string,
  activeVariants: readonly string[],
): boolean {
  if (preceding.trim()) return false
  const first = normalizedWords(insert)[0]
  return (
    (first === 'modern' || first === 'legacy') &&
    matchesSuggestionWord(first, activeVariants)
  )
}

/// Builds a completed query, folding any trailing preceding words that the
/// matched phrase already covers — so `on sa` completes to `for sale`, not
/// `on for sale`.
function completeSuggestionQuery(
  preceding: readonly SearchTextTerm[],
  insert: string,
  absorbed: number,
): string {
  const kept = preceding.slice(0, preceding.length - absorbed)
  const prefix = kept
    .map((term) => (term.exact ? `"${term.text}"` : term.text))
    .join(' ')
  return prefix ? `${prefix} ${insert}` : insert
}

function ownerSuggestions(text: string): PunkSuggestion[] {
  const token = activeSearchToken(text)
  if (token === undefined) return []
  if (tokenizeSearchText(text).some((term) => term.exact)) return []
  return suggestAddressLabels(text).map((suggestion) => ({
    kind: 'owner',
    label: suggestion.label.name,
    query: suggestion.query,
  }))
}

function suggestionTextVariants(value: string): string[] {
  const spaced = normalizeSuggestionText(value)
  if (!spaced) return []
  const joined = value
    .toLowerCase()
    .replaceAll(/[_-]+/g, '')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
  return joined && joined !== spaced ? [spaced, joined] : [spaced]
}

function normalizeSuggestionText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/[^#a-z0-9]+/g, ' ')
    .trim()
}

function normalizedWords(value: string): string[] {
  return normalizeSuggestionText(value).split(/\s+/).filter(Boolean)
}

function hasMinimumSignal(
  activeVariants: readonly string[],
  minLength: number,
): boolean {
  return activeVariants.some((variant) => signalLength(variant) >= minLength)
}

function signalLength(value: string): number {
  return value.replaceAll(/\s+/g, '').length
}

function matchesSuggestionWord(
  word: string,
  activeVariants: readonly string[],
): boolean {
  return activeVariants.some((active) => {
    if (!active) return false
    if (word.startsWith(active) || word.includes(` ${active}`)) return true
    return signalLength(active) >= 2 && word.includes(active)
  })
}

function bestMatchedPhrase(
  phrases: readonly string[],
  activeVariants: readonly string[],
  preceding: readonly SearchTextTerm[],
): { absorbed: number } | undefined {
  let best: { absorbed: number } | undefined
  for (const phrase of phrases) {
    const words = normalizedWords(phrase)
    for (let index = 0; index < words.length; index++) {
      const word = words[index]
      if (word === undefined) continue
      if (!matchesSuggestionWord(word, activeVariants)) continue
      const absorbed = absorbedPrecedingCount(words, index, preceding)
      if (best === undefined || absorbed > best.absorbed) best = { absorbed }
    }
  }
  return best
}

function absorbedPrecedingCount(
  words: readonly string[],
  matchedIndex: number,
  preceding: readonly SearchTextTerm[],
): number {
  let absorbed = 0
  let wordIndex = matchedIndex - 1
  for (
    let k = preceding.length - 1;
    k >= 0 && wordIndex >= 0;
    k--, wordIndex--
  ) {
    const term = preceding[k]
    const targetWord = words[wordIndex]
    if (term === undefined || targetWord === undefined) break
    const word = normalizeSuggestionText(term.text)
    if (term.exact || word === '' || !targetWord.startsWith(word)) break
    absorbed++
  }
  return absorbed
}

export function usePunkSearch(options: PunkSearchOptions = {}) {
  const offline = usePunksOffline()
  const route = options.syncRoute ? useRoute() : null
  const router = useRouter()
  const { marketStateLoaded, marketStateSets, listedPrices } =
    usePunkMarketState()

  const enableListedFilter = options.enableListedFilter ?? true
  const enableMarketQualifiers = options.enableMarketQualifiers ?? true
  const enableOwnerSearch = options.enableOwnerSearch ?? true
  const enableEnterNavigation = options.enableEnterNavigation ?? true
  const enableSuggestions = options.enableSuggestions ?? true
  const debounceMs = options.debounceMs ?? 80

  const baseQuery = computed(() => toValue(options.baseQuery))
  const text = ref(
    options.initialText ??
      (typeof route?.query.q === 'string' ? route.query.q : ''),
  )
  const toggleListed = ref(enableListedFilter && route?.query.sale === '1')

  const debouncedText = refDebounced(text, debounceMs)
  const qualifiers = computed(() =>
    extractPunkSearchQualifiers(debouncedText.value, {
      enableMarketQualifiers,
    }),
  )
  const listedActive = computed(
    () => enableListedFilter && (qualifiers.value.listed || toggleListed.value),
  )

  if (route) {
    let lastSyncedQ = typeof route.query.q === 'string' ? route.query.q : ''

    watch(debouncedText, (next) => {
      const q = next.trim()
      if (q === lastSyncedQ) return
      lastSyncedQ = q
      const { q: _omit, ...rest } = route.query
      router.replace({ query: q ? { ...rest, q } : rest })
    })

    watch(
      () => route.query.q,
      (q) => {
        const next = typeof q === 'string' ? q : ''
        if (next === lastSyncedQ) return
        lastSyncedQ = next
        text.value = next
      },
    )

    if (enableListedFilter) {
      let lastSyncedSale = route.query.sale === '1'

      watch(toggleListed, (on) => {
        if (on === lastSyncedSale) return
        lastSyncedSale = on
        const { sale: _omit, ...rest } = route.query
        router.replace({ query: on ? { ...rest, sale: '1' } : rest })
      })

      watch(
        () => route.query.sale,
        (s) => {
          const next = s === '1'
          if (next === lastSyncedSale) return
          lastSyncedSale = next
          toggleListed.value = next
        },
      )
    }
  }

  const isMobileSearch = useMediaQuery('(max-width: 640px)')
  const placeholder = computed(() =>
    isMobileSearch.value
      ? 'HOODIE, 2 COLORS, ...'
      : 'Try hoodie, 2 colors, vault.eth, #1234',
  )

  const ownerHandle = computed(() =>
    enableOwnerSearch
      ? resolvePunkSearchOwnerHandle(debouncedText.value, offline)
      : null,
  )
  const ensIdentifier = computed(() => {
    const handle = ownerHandle.value
    if (!handle || isAddress(handle)) return undefined
    return handle
  })
  const { data: ensData } = useEns(ensIdentifier)
  const ownerAddress = computed<Address | undefined>(() => {
    const handle = ownerHandle.value
    if (!handle) return undefined
    if (isAddress(handle)) return handle as Address
    const resolved = ensData.value?.address
    return resolved && isAddress(resolved) ? (resolved as Address) : undefined
  })
  const {
    vault: ownerVault,
    stash: ownerStash,
    loading: ownerCustodyLoading,
  } = useAccountAddresses(() => ownerAddress.value)
  const { v2Ids: ownedIds, loading: ownedLoading } = useAccountPunks({
    account: () => ownerAddress.value,
    vault: ownerVault,
    stash: ownerStash,
  })

  const parsedText = computed(() => parsePunkSearchText(qualifiers.value.text))

  // Curated collections the live query mentions (e.g. `burned`, `moma`), for
  // surfacing an explainer. Scans the trait text after market qualifiers and
  // colors are stripped, so `burned for sale` and `burned hoodie` still match;
  // unfinished aliases are completed first (`bur` → `burned`) so the card keeps
  // step with the grid.
  const collectionMatches = computed(() =>
    offline.collections.matches(
      offline.dataset.completeSearchText(parsedText.value.text ?? ''),
    ),
  )

  const criteriaQuery = computed<PunkQuery>(() => {
    const ownerMode = !!ownerHandle.value
    return {
      ...(baseQuery.value ?? {}),
      text: ownerMode ? undefined : parsedText.value.text,
      colors:
        ownerMode || !parsedText.value.colors
          ? undefined
          : { required: parsedText.value.colors },
    }
  })

  const offerQuery = computed<PunkQuery>(() =>
    toOfferCompatibleQuery(criteriaQuery.value),
  )

  const query = computed<PunkQuery>(() => {
    const ownerMode = !!ownerHandle.value

    let ids: Iterable<number> | undefined = baseQuery.value?.ids
    if (ownerMode) {
      if (
        !ownerAddress.value ||
        ownerCustodyLoading.value ||
        ownedLoading.value
      ) {
        ids = []
      } else {
        ids = intersectIds(ids, ownedIds.value)
      }
    }

    if (enableMarketQualifiers && marketStateLoaded.value) {
      if (qualifiers.value.listed) {
        ids = intersectIds(ids, marketStateSets.value.listed)
      }
      if (qualifiers.value.activeBids) {
        ids = intersectIds(ids, marketStateSets.value.active_bids)
      }
      if (qualifiers.value.legacyWrapped) {
        ids = intersectIds(ids, marketStateSets.value.legacy_wrapped)
      }
      if (qualifiers.value.modernWrapped) {
        ids = intersectIds(ids, marketStateSets.value.wrapped)
      }
      if (qualifiers.value.wrapped) {
        ids = intersectIds(
          ids,
          unionIds(
            marketStateSets.value.wrapped,
            marketStateSets.value.legacy_wrapped,
          ),
        )
      }
    }

    return {
      ...criteriaQuery.value,
      ids,
      sort: 'id',
    }
  })

  const ids = computed(() => {
    let result: number[]
    try {
      result = offline.search(query.value)
    } catch {
      return []
    }
    if (!listedActive.value || !marketStateLoaded.value) return result
    const prices = listedPrices.value
    return [...result].sort(
      (a, b) =>
        (prices.get(a) ?? Number.POSITIVE_INFINITY) -
        (prices.get(b) ?? Number.POSITIVE_INFINITY),
    )
  })

  /// Listed prices for the grid as wei (rendered with EthAmount), only while
  /// "for sale" is active. Indexer prices are ETH already rounded to ≤2
  /// decimals; scaling through integer hundredths recovers an exact wei value
  /// at any magnitude — `parseEther` can't, since its `toFixed` step emits
  /// exponential notation for the absurd "never sell" listings (e.g. #1477 at
  /// 1e42 ETH), which EthAmount then compacts to `>999T`.
  const prices = computed(() => {
    if (!listedActive.value || !marketStateLoaded.value) return undefined
    const out = new Map<number, bigint>()
    for (const [id, eth] of listedPrices.value) {
      if (!Number.isFinite(eth)) continue
      out.set(id, BigInt(Math.round(eth * 100)) * 10n ** 16n)
    }
    return out
  })

  const counts = computed(() => ({
    total: offline.dataset.count(baseQuery.value),
    filtered: ids.value.length,
  }))
  const showWrappedStateColors = computed(
    () =>
      qualifiers.value.wrapped ||
      qualifiers.value.legacyWrapped ||
      qualifiers.value.modernWrapped,
  )

  /// Typeahead completions for the word being typed: app market qualifiers
  /// first, then the SDK's trait / collection / skin-tone / count vocabulary.
  /// Empty when there's nothing to complete (see {@link activeSearchToken}).
  const suggestions = computed<PunkSuggestion[]>(() => {
    if (!enableSuggestions) return []
    const market = enableMarketQualifiers ? marketSuggestions(text.value) : []
    const owner =
      enableOwnerSearch && !punkSearchResolvesToCollection(text.value, offline)
        ? ownerSuggestions(text.value)
        : []
    return [...market, ...owner, ...offline.dataset.suggest(text.value)]
  })

  function onEnter() {
    if (!enableEnterNavigation) return
    const handle = resolvePunkSearchOwnerHandle(text.value, offline)
    if (handle) {
      router.push(`/profile/${handle}`)
      return
    }
    const id = Number(text.value.trim())
    if (Number.isInteger(id) && id >= 0 && id <= 9999) {
      router.push(`/punks/${id}`)
      return
    }
    if (ids.value.length === 1) {
      router.push(`/punks/${ids.value[0]}`)
    }
  }

  function clearSearch() {
    text.value = ''
  }

  return {
    text,
    debouncedText,
    toggleListed,
    listedActive,
    placeholder,
    ownerHandle,
    ownerAddress,
    query,
    criteriaQuery,
    offerQuery,
    ids,
    prices,
    counts,
    collectionMatches,
    showWrappedStateColors,
    suggestions,
    onEnter,
    clearSearch,
  }
}

function toOfferCompatibleQuery(query: PunkQuery): PunkQuery {
  const {
    ids: _ids,
    excludeIds: _excludeIds,
    offset: _offset,
    limit: _limit,
    sort: _sort,
    ...offerQuery
  } = query
  return offerQuery
}
