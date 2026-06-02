import { Hono } from 'hono'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { listing, punk, punkBid, v1Punk } from 'ponder:schema'
import { formatEther, getAddress, isAddress } from 'viem'
import { invalidate, memoize } from './cache'

const MARKET_STATE_TTL_MS = 10_000
const DEFAULT_PAIRS_LIMIT = 100
const MAX_PAIRS_LIMIT = 1000

type Row = Record<string, unknown>

type MarketStateResponse = {
  listed: number[]
  /// Parallel to `listed`; null when the listing is private (onlySellTo
  /// restricted) so consumers can omit it from price-asc sorts while still
  /// counting the punk as listed.
  listed_prices: (number | null)[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type PunkPairResponseItem = {
  punk_id: string
  owner: string
  v2: PunkPairCollectionState
  v1: PunkPairCollectionState
}

type PunkPairCollectionState = {
  owner: string | null
  native_owner: string | null
  is_wrapped: boolean
  wrapper: string | null
  updated_at: string
  block_number: string
}

type ListedEntry = { id: number; price: number | null }

function normalizeRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[]
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: Row[] }).rows
  }
  return []
}

function toPunkId(value: unknown): number {
  return Number(value)
}

async function loadListedPunkEntries(): Promise<ListedEntry[]> {
  /// Private "onlySellTo" listings still count as listed (they show up in the
  /// `listed` set) but their price is suppressed so consumers don't include
  /// them in a market-wide price-asc sort.
  const result = await db.execute(sql`
    SELECT l.punk_id, l.min_value_wei, l.only_sell_to
    FROM ${listing} l
    JOIN ${punk} p ON p.punk_id = l.punk_id
    WHERE l.active = true
      AND p.native_owner IS NOT NULL
      AND l.seller = p.native_owner
    ORDER BY l.min_value_wei ASC, l.punk_id ASC
  `)
  return normalizeRows(result).map((row) => ({
    id: toPunkId(row.punk_id),
    price: row.only_sell_to == null ? toEthRounded(row.min_value_wei) : null,
  }))
}

function toEthRounded(value: unknown): number {
  const wei = BigInt(value as bigint | string | number)
  return Number(parseFloat(formatEther(wei)).toFixed(2))
}

async function loadActiveBidPunkIds(): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT pb.punk_id
    FROM ${punkBid} pb
    JOIN ${punk} p ON p.punk_id = pb.punk_id
    WHERE pb.active = true
      AND pb.value_wei > 0
      AND p.native_owner IS NOT NULL
      AND lower(pb.bidder) != lower(p.native_owner)
    ORDER BY pb.punk_id ASC
  `)
  return normalizeRows(result).map((row) => toPunkId(row.punk_id))
}

async function loadWrappedPunkIds(
  wrapper: 'wrapped_punks' | 'cryptopunks_721',
): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT p.punk_id
    FROM ${punk} p
    WHERE p.is_wrapped = true
      AND p.wrapper = ${wrapper}
    ORDER BY p.punk_id ASC
  `)
  return normalizeRows(result).map((row) => toPunkId(row.punk_id))
}

async function loadPunkPairs({
  owner,
  limit,
  offset,
}: {
  owner: string | null
  limit: number
  offset: number
}): Promise<{ items: PunkPairResponseItem[]; total: number }> {
  const ownerFilter = owner ? sql`AND lower(p.owner) = lower(${owner})` : sql``

  const [rowsResult, countResult] = await Promise.all([
    db.execute(sql`
      SELECT
        p.punk_id,
        p.owner,
        p.native_owner AS v2_native_owner,
        p.is_wrapped AS v2_is_wrapped,
        p.wrapper AS v2_wrapper,
        p.updated_at AS v2_updated_at,
        p.block_number AS v2_block_number,
        v1.owner AS v1_owner,
        v1.native_owner AS v1_native_owner,
        v1.is_wrapped AS v1_is_wrapped,
        v1.wrapper AS v1_wrapper,
        v1.updated_at AS v1_updated_at,
        v1.block_number AS v1_block_number
      FROM ${punk} p
      JOIN ${v1Punk} v1
        ON v1.punk_id = p.punk_id
       AND lower(v1.owner) = lower(p.owner)
      WHERE v1.owner IS NOT NULL
        ${ownerFilter}
      ORDER BY p.punk_id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*)::bigint AS total
      FROM ${punk} p
      JOIN ${v1Punk} v1
        ON v1.punk_id = p.punk_id
       AND lower(v1.owner) = lower(p.owner)
      WHERE v1.owner IS NOT NULL
        ${ownerFilter}
    `),
  ])

  const countRow = normalizeRows(countResult)[0]
  return {
    items: normalizeRows(rowsResult).map((row) => ({
      punk_id: String(row.punk_id),
      owner: String(row.owner),
      v2: {
        owner: String(row.owner),
        native_owner: nullableString(row.v2_native_owner),
        is_wrapped: Boolean(row.v2_is_wrapped),
        wrapper: nullableString(row.v2_wrapper),
        updated_at: String(row.v2_updated_at),
        block_number: String(row.v2_block_number),
      },
      v1: {
        owner: nullableString(row.v1_owner),
        native_owner: nullableString(row.v1_native_owner),
        is_wrapped: Boolean(row.v1_is_wrapped),
        wrapper: nullableString(row.v1_wrapper),
        updated_at: String(row.v1_updated_at),
        block_number: String(row.v1_block_number),
      },
    })),
    total: Number(countRow?.total ?? 0),
  }
}

async function computeMarketState(): Promise<MarketStateResponse> {
  const [listedEntries, activeBids, legacyWrapped, wrapped] = await Promise.all(
    [
      loadListedPunkEntries(),
      loadActiveBidPunkIds(),
      loadWrappedPunkIds('wrapped_punks'),
      loadWrappedPunkIds('cryptopunks_721'),
    ],
  )

  return {
    listed: listedEntries.map((entry) => entry.id),
    listed_prices: listedEntries.map((entry) => entry.price),
    active_bids: activeBids,
    legacy_wrapped: legacyWrapped,
    wrapped,
    generated_at: Date.now(),
  }
}

const app = new Hono()

const MARKET_STATE_CACHE_KEY = 'punks:market-state'

async function loadMarketState(fresh = false) {
  if (fresh) invalidate(MARKET_STATE_CACHE_KEY)
  return await memoize(MARKET_STATE_CACHE_KEY, MARKET_STATE_TTL_MS, () =>
    computeMarketState(),
  )
}

// GET /punks/market-state — compact original CryptoPunks market state.
// Pass `?fresh=1` to bypass the in-process memoize and the HTTP cache, e.g.
// right after a wrap/unwrap so the caller sees the new wrapper state.
app.get('/market-state', async (c) => {
  const fresh = c.req.query('fresh') === '1'
  const data = await loadMarketState(fresh)
  c.header(
    'cache-control',
    fresh ? 'no-store' : 'public, max-age=10, stale-while-revalidate=30',
  )
  return c.json(data)
})

// GET /punks/pairs — V1+V2 pairs currently held by the same public owner.
// Optional `owner` filters to one wallet/custody address.
app.get('/pairs', async (c) => {
  const ownerParam = c.req.query('owner')
  if (ownerParam && !isAddress(ownerParam)) {
    return c.json({ error: 'invalid_owner' }, 400)
  }
  const owner = ownerParam ? getAddress(ownerParam) : null
  const limit = clampLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))
  const data = await loadPunkPairs({ owner, limit, offset })

  return c.json({
    items: data.items,
    total: data.total,
    limit,
    offset,
  })
})

function clampLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAIRS_LIMIT
  return Math.min(parsed, MAX_PAIRS_LIMIT)
}

function parseOffset(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value)
}

export default app
