import {
  createPunksSdk,
  type PunkQuery,
  type PunksSdk,
} from '@networked-art/punks-sdk'
import { bundledOfflinePunksData } from '@networked-art/punks-sdk/offline-data'
import { fetchIndexerAt, getIndexerUrl } from '~/utils/indexer'
import {
  extractPunkSearchQualifiers,
  intersectIds,
  parsePunkSearchText,
  resolvePunkSearchOwnerHandle,
  unionIds,
} from '~/utils/punkSearch'
import { loadProfileOgDataAt } from '~/utils/profileOg'

export const SEARCH_OG_LIMIT = 64

type PunkMarketStateResponse = {
  listed: number[]
  listed_prices: (number | null)[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type PunkMarketStateSets = {
  listed: Set<number>
  active_bids: Set<number>
  legacy_wrapped: Set<number>
  wrapped: Set<number>
}

export type SearchOgInput = {
  q: string
  sale?: boolean
  limit?: number
}

export type SearchOgResult = {
  ids: number[]
  total: number
  label: string
}

let offline: PunksSdk | null = null

function punks(): PunksSdk {
  offline ??= createPunksSdk({ dataset: bundledOfflinePunksData })
  return offline
}

export async function resolveSearchOg(
  input: SearchOgInput,
): Promise<SearchOgResult | null> {
  try {
    const indexerUrl = getIndexerUrl()
    return await resolveSearchOgAt(input, indexerUrl)
  } catch {
    return null
  }
}

export async function resolveSearchOgAt(
  input: SearchOgInput,
  indexerUrl: string,
): Promise<SearchOgResult | null> {
  const label = input.q.trim()
  if (!label) return null

  const limit = Math.max(1, Math.floor(input.limit ?? SEARCH_OG_LIMIT))
  const sdk = punks()
  const qualifiers = extractPunkSearchQualifiers(label)
  const ownerHandle = resolvePunkSearchOwnerHandle(label, sdk)
  const needsMarketState =
    input.sale === true ||
    qualifiers.listed ||
    qualifiers.activeBids ||
    qualifiers.wrapped ||
    qualifiers.legacyWrapped ||
    qualifiers.modernWrapped

  const [ownerIds, marketState] = await Promise.all([
    ownerHandle ? resolveOwnerIds(ownerHandle, indexerUrl) : Promise.resolve(null),
    needsMarketState ? fetchPunkMarketState(indexerUrl) : Promise.resolve(null),
  ])

  if (ownerHandle && ownerIds === null) return null
  if (needsMarketState && marketState === null) return null

  const parsedText = parsePunkSearchText(qualifiers.text)
  const ownerMode = ownerHandle !== null
  let ids: Iterable<number> | undefined = ownerMode ? ownerIds! : undefined

  if (marketState) {
    const sets = toMarketStateSets(marketState)
    if (qualifiers.listed) {
      ids = intersectIds(ids, sets.listed)
    }
    if (qualifiers.activeBids) {
      ids = intersectIds(ids, sets.active_bids)
    }
    if (qualifiers.legacyWrapped) {
      ids = intersectIds(ids, sets.legacy_wrapped)
    }
    if (qualifiers.modernWrapped) {
      ids = intersectIds(ids, sets.wrapped)
    }
    if (qualifiers.wrapped) {
      ids = intersectIds(
        ids,
        unionIds(sets.wrapped, sets.legacy_wrapped),
      )
    }
  }

  const query: PunkQuery = {
    text: ownerMode ? undefined : parsedText.text,
    colors:
      ownerMode || !parsedText.colors
        ? undefined
        : { required: parsedText.colors },
    ids,
    sort: 'id',
  }

  let result = sdk.search(query)
  if ((input.sale === true || qualifiers.listed) && marketState) {
    const prices = toListedPrices(marketState)
    result = [...result].sort(
      (a, b) =>
        (prices.get(a) ?? Number.POSITIVE_INFINITY) -
        (prices.get(b) ?? Number.POSITIVE_INFINITY),
    )
  }

  if (result.length === 0) return null

  return {
    ids: result.slice(0, limit),
    total: result.length,
    label,
  }
}

export function searchOgDescription(query: string): string | undefined {
  const label = query.trim()
  return label ? `Browse CryptoPunks matching "${label}".` : undefined
}

async function resolveOwnerIds(
  handle: string,
  indexerUrl: string,
): Promise<number[] | null> {
  if (!indexerUrl) return null
  const profile = await loadProfileOgDataAt(handle, indexerUrl)
  return profile?.ids ?? null
}

async function fetchPunkMarketState(
  indexerUrl: string,
): Promise<PunkMarketStateResponse | null> {
  if (!indexerUrl) return null
  try {
    return await fetchIndexerAt<PunkMarketStateResponse>(
      indexerUrl,
      '/punks/market-state',
    )
  } catch {
    return null
  }
}

function toMarketStateSets(source: PunkMarketStateResponse): PunkMarketStateSets {
  return {
    listed: new Set(source.listed),
    active_bids: new Set(source.active_bids),
    legacy_wrapped: new Set(source.legacy_wrapped),
    wrapped: new Set(source.wrapped),
  }
}

function toListedPrices(source: PunkMarketStateResponse): Map<number, number> {
  const map = new Map<number, number>()
  const length = Math.min(source.listed.length, source.listed_prices.length)
  for (let i = 0; i < length; i++) {
    const price = source.listed_prices[i]
    if (price == null) continue
    map.set(source.listed[i]!, price)
  }
  return map
}
