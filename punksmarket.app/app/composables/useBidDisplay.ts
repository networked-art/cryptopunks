import { formatSearchText, isPunksFilterEmpty } from '@networked-art/punks-sdk'
import { bidToQuery, type CollectionBid } from './usePunksMarketBids'

/// Pieces a bid card needs to render: visual mosaic, headline, search link to
/// the full matching set. Built once per bid and treated as immutable —
/// re-derive when the bid record changes.
export type BidDisplay = {
  /// Big primary label shown on the card.
  title: string
  /// Optional one-line description of the criteria (humanized trait/color
  /// tokens). `null` when there's nothing extra to say beyond the title.
  description: string | null
  /// Match count from the offline counter. `null` when the bid uses features
  /// the offline grammar cannot express — those rows still render, just
  /// without a count.
  matchCount: number | null
  /// Punk ids to show in the mosaic preview, capped at a small number.
  previewIds: number[]
  /// Whether this bid is for one specific punk — the card uses a single big
  /// thumbnail rather than a mosaic for these.
  isExact: boolean
  /// Route target for "see all matching punks". `null` when the criteria
  /// can't round-trip through the search-text grammar.
  matchesLink: { path: string; query?: Record<string, string> } | null
}

const PREVIEW_LIMIT = 4

export function useBidDisplay(bid: MaybeRefOrGetter<CollectionBid>) {
  const offline = usePunksOffline()

  return computed<BidDisplay>(() => {
    const b = toValue(bid)
    const filterEmpty = isPunksFilterEmpty(b.criteria)
    const isExact =
      filterEmpty && b.includeIds.length === 1 && b.excludeIds.length === 0

    /// For exact-id bids we already have the punk; otherwise we ask the
    /// offline searcher for matches. The searcher throws for filters with
    /// features it can't express (forbidden masks, exotic any-of) — in that
    /// case we still render the card but without preview or count.
    let matchIds: number[] | null = null
    if (filterEmpty && b.includeIds.length) {
      matchIds = b.includeIds.slice()
    } else {
      try {
        matchIds = offline.search(bidToQuery(b))
      } catch {
        matchIds = null
      }
    }

    const matchCount = matchIds?.length ?? null
    const previewIds = matchIds ? matchIds.slice(0, PREVIEW_LIMIT) : []

    return {
      title: bidTitle(b, filterEmpty),
      description: bidDescription(b, offline.dataset.source, filterEmpty),
      matchCount,
      previewIds,
      isExact,
      matchesLink: matchesLink(b, offline.dataset.source),
    }
  })
}

function bidTitle(bid: CollectionBid, filterEmpty: boolean): string {
  if (filterEmpty) {
    if (bid.includeIds.length === 1 && bid.excludeIds.length === 0) {
      return `Punk #${bid.includeIds[0]}`
    }
    if (bid.includeIds.length > 1) {
      return `${bid.includeIds.length.toLocaleString()} specific punks`
    }
    return 'Any punk'
  }
  return 'Trait bid'
}

function bidDescription(
  bid: CollectionBid,
  source: Parameters<typeof formatSearchText>[0],
  filterEmpty: boolean,
): string | null {
  if (filterEmpty) {
    if (bid.excludeIds.length > 0 && bid.includeIds.length === 0) {
      return `Any punk except ${bid.excludeIds.length.toLocaleString()} excluded`
    }
    return null
  }

  try {
    const text = formatSearchText(source, { criteria: bid.criteria })
    return humanizeCriteriaText(text) || null
  } catch {
    return 'Custom on-chain criteria'
  }
}

/// `formatSearchText` returns the canonical search-text grammar ("hoodie"
/// "2 colors" `#1234`). Strip the quoting that makes literal terms parse-safe
/// but reads as noise in a one-line description.
function humanizeCriteriaText(text: string): string {
  const tokens: string[] = []
  const rest = text
    .replace(/"([^"]+)"/g, (_match, term: string) => {
      tokens.push(term)
      return ' '
    })
    .trim()
  if (rest) tokens.push(rest)
  return tokens.join(' · ')
}

function matchesLink(
  bid: CollectionBid,
  source: Parameters<typeof formatSearchText>[0],
): BidDisplay['matchesLink'] {
  try {
    const q = formatSearchText(source, {
      criteria: bid.criteria,
      includeIds: bid.includeIds,
      excludeIds: bid.excludeIds,
    })
    return q ? { path: '/', query: { q } } : { path: '/' }
  } catch {
    return null
  }
}

