import { refDebounced, useMediaQuery } from '@vueuse/core'
import {
  activeSearchToken,
  addressForLabel,
  tokenizeSearchText,
  type PunkQuery,
  type SearchSuggestion,
  type SearchTextTerm,
} from '@networked-art/punks-sdk'
import { isAddress, type Address } from 'viem'
import {
  computed,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

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
/// plus the app-only `market` kind for on-chain qualifiers (for sale, …).
export type PunkSuggestion = Omit<SearchSuggestion, 'kind'> & {
  kind: SearchSuggestion['kind'] | 'market'
}

/// Market qualifiers live in the app, not the SDK: they resolve against
/// on-chain market state, not the dataset. `insert` is the canonical phrase
/// the parser understands; a partial input completes the qualifier when it
/// prefixes any word of that phrase (so `for` → "For sale") or one of the
/// extra `synonyms` the phrase itself doesn't spell out (`listed`, `wrapper`).
const MARKET_QUALIFIERS: { label: string; insert: string; synonyms: string[] }[] =
  [
    { label: 'For sale', insert: 'for sale', synonyms: ['listed', 'listing'] },
    { label: 'Wrapped', insert: 'wrapped', synonyms: ['wrapper'] },
    { label: 'Has bids', insert: 'has bids', synonyms: [] },
  ]

function marketSuggestions(text: string): PunkSuggestion[] {
  const token = activeSearchToken(text)
  if (token === undefined) return []
  const active = token.active.toLowerCase()
  if (active.length < 2) return []
  const preceding = tokenizeSearchText(token.preceding)
  return MARKET_QUALIFIERS.filter((q) =>
    [...q.insert.split(' '), ...q.synonyms].some((word) =>
      word.startsWith(active),
    ),
  ).map((q) => ({
    kind: 'market',
    label: q.label,
    query: completeMarketQuery(preceding, q.insert),
  }))
}

/// Builds the completed query for a market qualifier, folding any trailing
/// preceding words the insert phrase's own leading words already cover — so
/// `for sa` completes to `for sale`, not `for for sale`, and re-selecting an
/// already-typed `has bids` stays `has bids`. The active word is always the
/// final phrase word (or a trigger synonym of it), so we walk left from the
/// insert's penultimate word, the same absorption the SDK does for traits.
function completeMarketQuery(
  preceding: readonly SearchTextTerm[],
  insert: string,
): string {
  const words = insert.split(' ')
  let absorbed = 0
  for (
    let k = preceding.length - 1, w = words.length - 2;
    k >= 0 && w >= 0;
    k--, w--
  ) {
    const term = preceding[k]
    const insertWord = words[w]
    if (term === undefined || insertWord === undefined) break
    const word = normalizeMarketWord(term.text)
    if (term.exact || word === '' || !insertWord.startsWith(word)) break
    absorbed++
  }
  const kept = preceding.slice(0, preceding.length - absorbed)
  const prefix = kept
    .map((term) => (term.exact ? `"${term.text}"` : term.text))
    .join(' ')
  return prefix ? `${prefix} ${insert}` : insert
}

function normalizeMarketWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const LISTED_QUALIFIER =
  /(^|[\s,])(?:for\s+sale|on\s+sale|list(?:ed|ing|ings)?|sale)(?=$|[\s,])/gi
const BID_QUALIFIER =
  /(^|[\s,])(?:has\s+bids?|with\s+bids?|active\s+bids?|bids?)(?=$|[\s,])/gi
const WRAPPED_WORD = 'wrap(?:ped|per)?'
const LEGACY_WRAPPER_SYNONYM = 'wrapped[_\\s-]*punks'
const MODERN_WRAPPER_SYNONYM = '(?:erc[-\\s]?721|cryptopunks\\s*721)'
const LEGACY_WRAPPED_WORD = `(?:${WRAPPED_WORD}|${LEGACY_WRAPPER_SYNONYM})`
const MODERN_WRAPPED_WORD = `(?:${WRAPPED_WORD}|${MODERN_WRAPPER_SYNONYM})`
const LEGACY_WRAPPED_QUALIFIER = qualifierPattern(
  `(?:legacy\\s+${LEGACY_WRAPPED_WORD}|${LEGACY_WRAPPED_WORD}\\s+legacy|${LEGACY_WRAPPER_SYNONYM})`,
)
const MODERN_WRAPPED_QUALIFIER = qualifierPattern(
  `(?:modern\\s+${MODERN_WRAPPED_WORD}|${MODERN_WRAPPED_WORD}\\s+modern|${MODERN_WRAPPER_SYNONYM})`,
)
const WRAPPED_QUALIFIER = qualifierPattern(WRAPPED_WORD)
const ENS_HANDLE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i
const HEX_COLOR_TOKEN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g

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
    extractQualifiers(debouncedText.value, {
      enableMarketQualifiers,
    }),
  )
  const listedActive = computed(
    () =>
      enableListedFilter &&
      (qualifiers.value.listed || toggleListed.value),
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

  /// Owner mode also triggers on a curated address label (e.g. `NODE`,
  /// `NODE FOUNDATION`) resolving to its account. Curated collection aliases
  /// (e.g. `moma`) are left to the trait/collection path so the grid keeps
  /// showing the curated set rather than the wallet's current holdings.
  function resolveOwnerHandle(input: string): string | null {
    const direct = detectOwnerHandle(input)
    if (direct) return direct
    const value = input.trim()
    if (!value) return null
    // Complete unfinished aliases (`bur` → `burned`) so a prefix that the grid
    // reads as a collection isn't mistaken for an owner label here.
    const completed = offline.dataset.completeSearchText(value)
    if (offline.collections.matches(completed).length) return null
    return addressForLabel(value) ?? null
  }

  const ownerHandle = computed(() =>
    enableOwnerSearch ? resolveOwnerHandle(debouncedText.value) : null,
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
  const { ids: ownedIds, loading: ownedLoading } = useOwnedPunks(
    () => ownerAddress.value,
  )

  const parsedText = computed(() => {
    const raw = qualifiers.value.text.trim()
    if (!raw) return { text: undefined, colors: undefined }
    const colors = raw.match(HEX_COLOR_TOKEN)
    const remaining = raw
      .replace(HEX_COLOR_TOKEN, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      text: remaining || undefined,
      colors: colors?.length ? colors : undefined,
    }
  })

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
      if (!ownerAddress.value || ownedLoading.value) {
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
    const market = enableMarketQualifiers
      ? marketSuggestions(debouncedText.value)
      : []
    return [...market, ...offline.dataset.suggest(debouncedText.value)]
  })

  function onEnter() {
    if (!enableEnterNavigation) return
    const handle = resolveOwnerHandle(text.value)
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
    counts,
    collectionMatches,
    showWrappedStateColors,
    suggestions,
    onEnter,
    clearSearch,
  }
}

function qualifierPattern(source: string): RegExp {
  return new RegExp(`(^|[\\s,])${source}(?=$|[\\s,])`, 'gi')
}

function detectOwnerHandle(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (isAddress(value)) return value
  if (ENS_HANDLE.test(value) && /\.eth$/i.test(value)) return value
  return null
}

function extractQualifiers(
  input: string,
  options: { enableMarketQualifiers: boolean },
) {
  let listed = false
  let activeBids = false
  let wrapped = false
  let legacyWrapped = false
  let modernWrapped = false

  const cleaned = options.enableMarketQualifiers
    ? input
        .replace(LEGACY_WRAPPED_QUALIFIER, (_match, prefix: string) => {
          legacyWrapped = true
          return prefix || ''
        })
        .replace(MODERN_WRAPPED_QUALIFIER, (_match, prefix: string) => {
          modernWrapped = true
          return prefix || ''
        })
        .replace(LISTED_QUALIFIER, (_match, prefix: string) => {
          listed = true
          return prefix || ''
        })
        .replace(BID_QUALIFIER, (_match, prefix: string) => {
          activeBids = true
          return prefix || ''
        })
        .replace(WRAPPED_QUALIFIER, (_match, prefix: string) => {
          wrapped = true
          return prefix || ''
        })
    : input

  return {
    text: normalizeQualifierText(cleaned),
    listed,
    activeBids,
    wrapped,
    legacyWrapped,
    modernWrapped,
  }
}

function normalizeQualifierText(input: string) {
  return input
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function intersectIds(
  baseIds: Iterable<number> | undefined,
  filterIds: Iterable<number>,
) {
  if (!baseIds) return Array.from(filterIds)
  const filter = new Set(filterIds)
  return Array.from(baseIds).filter((id) => filter.has(id))
}

function unionIds(...groups: Iterable<number>[]) {
  return new Set(groups.flatMap((group) => Array.from(group)))
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
