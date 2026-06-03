import type {
  KindFilter,
  KnownActivitySource,
} from '~/composables/useActivityFeed'

export type ActivityFilterKey =
  | 'sales'
  | 'marketplace'
  | 'auctions'
  | 'offers'
  | 'wraps'

type ActivityFilter = {
  key: ActivityFilterKey
  label: string
  matchers: readonly KindFilter[]
}

// `bid` / `bid_cancelled` fire from both the CryptoPunks marketplaces and the
// PunksAuction contract, so we split them by source.
const MARKETPLACE_SOURCES = [
  'cryptopunks_v2',
  'wrapped_punks',
  'cryptopunks_721',
] as const satisfies readonly KnownActivitySource[]

export const ACTIVITY_FILTERS = [
  { key: 'sales', label: 'Sales', matchers: [{ kinds: ['sale'] }] },
  {
    key: 'marketplace',
    label: 'Marketplace',
    matchers: [
      { kinds: ['listing', 'listing_cancelled'] },
      { kinds: ['bid', 'bid_cancelled'], sources: MARKETPLACE_SOURCES },
    ],
  },
  {
    key: 'auctions',
    label: 'Auctions',
    matchers: [
      {
        kinds: [
          'lot_created',
          'lot_cancelled',
          'lot_cleared',
          'lot_updated',
          'auction_started',
          'auction_settled',
        ],
      },
      { kinds: ['bid', 'bid_cancelled'], sources: ['punks_auction'] },
    ],
  },
  {
    key: 'offers',
    label: 'Purchase Offers',
    matchers: [
      { kinds: ['offer_placed', 'offer_cancelled', 'offer_adjusted'] },
    ],
  },
  { key: 'wraps', label: 'Wraps', matchers: [{ kinds: ['wrap', 'unwrap'] }] },
] as const satisfies readonly ActivityFilter[]

const FILTER_KEYS = new Set<ActivityFilterKey>(
  ACTIVITY_FILTERS.map((f) => f.key),
)

export function useActivityFilters() {
  const route = useRoute()
  const router = useRouter()

  const activeFilters = computed(
    () => new Set(parseActivityFilterQuery(route.query.t)),
  )
  const hasFilters = computed(() => activeFilters.value.size > 0)
  const selectedKindFilters = computed<KindFilter[] | undefined>(() => {
    if (!activeFilters.value.size) return undefined

    const matchers: KindFilter[] = []
    for (const filter of ACTIVITY_FILTERS) {
      if (activeFilters.value.has(filter.key)) matchers.push(...filter.matchers)
    }
    return matchers
  })

  function writeFilters(next: Set<ActivityFilterKey>) {
    const ordered = ACTIVITY_FILTERS.filter((f) => next.has(f.key)).map(
      (f) => f.key,
    )
    const t = ordered.join(',')
    router.replace({
      query: { ...route.query, t: t || undefined },
    })
  }

  function toggleFilter(key: ActivityFilterKey) {
    const next = new Set(activeFilters.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    writeFilters(next)
  }

  function clearFilters() {
    writeFilters(new Set())
  }

  return {
    filters: ACTIVITY_FILTERS,
    activeFilters,
    hasFilters,
    selectedKindFilters,
    toggleFilter,
    clearFilters,
  }
}

function parseActivityFilterQuery(raw: unknown): ActivityFilterKey[] {
  const str = Array.isArray(raw) ? raw[0] : raw
  if (typeof str !== 'string' || !str) return []

  const seen = new Set<ActivityFilterKey>()
  for (const part of str.split(',')) {
    const key = part.trim() as ActivityFilterKey
    if (FILTER_KEYS.has(key)) seen.add(key)
  }
  return [...seen]
}
