import { Hono } from 'hono'
import { and, asc, count, desc, eq, sql } from 'ponder'
import { db } from 'ponder:api'
import {
  bidColor,
  bidExcludeId,
  bidIncludeId,
  bidTrait,
  marketBid,
  punkColor,
  punkTrait,
  punkVisual,
} from 'ponder:schema'
import { getAddress, isAddress } from 'viem'

// Mirrors Punks.sol constants.
const TRAIT_COUNT = 111
const PALETTE_SIZE = 222

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type MarketBidRow = typeof marketBid.$inferSelect

const SORT_MAP = {
  'bid_wei-desc': desc(marketBid.bid_wei),
  'bid_wei-asc': asc(marketBid.bid_wei),
  'timestamp-desc': desc(marketBid.timestamp),
  'timestamp-asc': asc(marketBid.timestamp),
  'bid_id-desc': desc(marketBid.bid_id),
  'bid_id-asc': asc(marketBid.bid_id),
} as const
type SortKey = keyof typeof SORT_MAP

function parseLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function parseOffset(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function parseSort(value: string): (typeof SORT_MAP)[SortKey] | null {
  return value in SORT_MAP ? SORT_MAP[value as SortKey] : null
}

function bigStr(value: bigint | string | number | null | undefined): string {
  if (value == null) throw new Error('null bigint')
  return String(value)
}

function nullableBigStr(
  value: bigint | string | number | null | undefined,
): string | null {
  if (value == null) return null
  return String(value)
}

function toInt(value: number | string | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number.parseInt(value, 10)
}

function serialize(row: MarketBidRow) {
  return {
    bidId: bigStr(row.bid_id),
    bidder: row.bidder,
    bidWei: bigStr(row.bid_wei),
    settlementWei: bigStr(row.settlement_wei),
    active: !!row.active,
    acceptedPunkId: nullableBigStr(row.accepted_punk_id),
    criteria: {
      requiredTraitMask: bigStr(row.required_trait_mask),
      forbiddenTraitMask: bigStr(row.forbidden_trait_mask),
      anyOfTraitMask: bigStr(row.any_of_trait_mask),
      requiredColorMask: bigStr(row.required_color_mask),
      forbiddenColorMask: bigStr(row.forbidden_color_mask),
      anyOfColorMask: bigStr(row.any_of_color_mask),
      minPixelCount: toInt(row.min_pixel_count),
      maxPixelCount: toInt(row.max_pixel_count),
      minColorCount: toInt(row.min_color_count),
      maxColorCount: toInt(row.max_color_count),
    },
    includeIds: parseIds(row.include_ids_json),
    excludeIds: parseIds(row.exclude_ids_json),
    txHash: row.tx_hash,
    blockNumber: bigStr(row.block_number),
    logIndex: toInt(row.log_index),
    timestamp: bigStr(row.timestamp),
    updatedAt: bigStr(row.updated_at),
  }
}

function parseIds(value: string | null | undefined): number[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((n: unknown) => Number(n)) : []
  } catch {
    return []
  }
}

// Normalizes either drizzle row arrays or pg-style { rows } objects.
function normalizeRows(result: unknown): MarketBidRow[] {
  if (Array.isArray(result)) return result as MarketBidRow[]
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: MarketBidRow[] }).rows
  }
  return []
}

const app = new Hono()

// GET /bids — paginated list with filters.
//   ?active=true|false        filter by active flag
//   ?bidder=0x...              filter by bidder
//   ?limit=&offset=            pagination
//   ?sort=bid_wei-desc|...     ordering
app.get('/', async (c) => {
  const activeParam = c.req.query('active')
  const bidderParam = c.req.query('bidder')
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))
  const sortParam = c.req.query('sort') ?? 'bid_wei-desc'
  const orderBy = parseSort(sortParam)
  if (orderBy === null) {
    return c.json({ error: 'invalid_sort', valid: Object.keys(SORT_MAP) }, 400)
  }

  const conds = []
  if (activeParam !== undefined) {
    conds.push(eq(marketBid.active, activeParam === 'true'))
  }
  if (bidderParam !== undefined) {
    if (!isAddress(bidderParam)) {
      return c.json({ error: 'invalid_bidder' }, 400)
    }
    conds.push(eq(marketBid.bidder, getAddress(bidderParam)))
  }
  const where = conds.length > 0 ? and(...conds) : undefined

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(marketBid)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(marketBid).where(where),
  ])
  const total = Number(totalRows[0]?.value ?? 0)

  return c.json({
    items: rows.map(serialize),
    total,
    limit,
    offset,
  })
})

// GET /bids/matching/punk/:punkId — bids that would accept this punk.
app.get('/matching/punk/:punkId{[0-9]+}', async (c) => {
  const punkId = BigInt(c.req.param('punkId'))
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))

  const result = await db.execute(sql`
    SELECT b.*
    FROM ${marketBid} b
    WHERE b.active = true
      AND (NOT b.has_include_ids OR EXISTS (
        SELECT 1 FROM ${bidIncludeId} bi
        WHERE bi.bid_id = b.bid_id AND bi.punk_id = ${punkId}
      ))
      AND NOT EXISTS (
        SELECT 1 FROM ${bidExcludeId} be
        WHERE be.bid_id = b.bid_id AND be.punk_id = ${punkId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'required'
          AND bt.trait_id NOT IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = ${punkId}
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'forbidden'
          AND bt.trait_id IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = ${punkId}
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
            AND bt.trait_id IN (
              SELECT trait_id FROM ${punkTrait} WHERE punk_id = ${punkId}
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'required'
          AND bc.color_id NOT IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = ${punkId}
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'forbidden'
          AND bc.color_id IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = ${punkId}
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
            AND bc.color_id IN (
              SELECT color_id FROM ${punkColor} WHERE punk_id = ${punkId}
            )
        )
      )
      AND (
        b.max_pixel_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = ${punkId}
            AND pv.pixel_count BETWEEN b.min_pixel_count AND b.max_pixel_count
        )
      )
      AND (
        b.max_color_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = ${punkId}
            AND pv.color_count BETWEEN b.min_color_count AND b.max_color_count
        )
      )
    ORDER BY b.bid_wei DESC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const rows = normalizeRows(result)
  return c.json({
    punkId: punkId.toString(),
    items: rows.map(serialize),
    limit,
    offset,
  })
})

// GET /bids/matching/trait/:traitId — bids that would accept at least one
// punk having this trait.
app.get('/matching/trait/:traitId{[0-9]+}', async (c) => {
  const traitId = Number.parseInt(c.req.param('traitId'), 10)
  if (!Number.isFinite(traitId) || traitId < 0 || traitId >= TRAIT_COUNT) {
    return c.json({ error: 'invalid_trait_id' }, 400)
  }
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))

  // Join market_bids against the set of punks holding the trait, apply the
  // same per-punk matching predicates, DISTINCT on bid_id.
  const result = await db.execute(sql`
    SELECT DISTINCT ON (b.bid_wei, b.bid_id) b.*
    FROM ${marketBid} b
    JOIN ${punkTrait} pt_t ON pt_t.trait_id = ${traitId}
    WHERE b.active = true
      AND (NOT b.has_include_ids OR EXISTS (
        SELECT 1 FROM ${bidIncludeId} bi
        WHERE bi.bid_id = b.bid_id AND bi.punk_id = pt_t.punk_id
      ))
      AND NOT EXISTS (
        SELECT 1 FROM ${bidExcludeId} be
        WHERE be.bid_id = b.bid_id AND be.punk_id = pt_t.punk_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'required'
          AND bt.trait_id NOT IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = pt_t.punk_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'forbidden'
          AND bt.trait_id IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = pt_t.punk_id
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
            AND bt.trait_id IN (
              SELECT trait_id FROM ${punkTrait} WHERE punk_id = pt_t.punk_id
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'required'
          AND bc.color_id NOT IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = pt_t.punk_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'forbidden'
          AND bc.color_id IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = pt_t.punk_id
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
            AND bc.color_id IN (
              SELECT color_id FROM ${punkColor} WHERE punk_id = pt_t.punk_id
            )
        )
      )
      AND (
        b.max_pixel_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = pt_t.punk_id
            AND pv.pixel_count BETWEEN b.min_pixel_count AND b.max_pixel_count
        )
      )
      AND (
        b.max_color_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = pt_t.punk_id
            AND pv.color_count BETWEEN b.min_color_count AND b.max_color_count
        )
      )
    ORDER BY b.bid_wei DESC, b.bid_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const rows = normalizeRows(result)
  return c.json({
    traitId,
    items: rows.map(serialize),
    limit,
    offset,
  })
})

// GET /bids/matching/color/:colorId — symmetric with trait matching but joined
// on the punks having that color.
app.get('/matching/color/:colorId{[0-9]+}', async (c) => {
  const colorId = Number.parseInt(c.req.param('colorId'), 10)
  if (!Number.isFinite(colorId) || colorId <= 0 || colorId >= PALETTE_SIZE) {
    return c.json({ error: 'invalid_color_id' }, 400)
  }
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))

  const result = await db.execute(sql`
    SELECT DISTINCT ON (b.bid_wei, b.bid_id) b.*
    FROM ${marketBid} b
    JOIN ${punkColor} pc_t ON pc_t.color_id = ${colorId}
    WHERE b.active = true
      AND (NOT b.has_include_ids OR EXISTS (
        SELECT 1 FROM ${bidIncludeId} bi
        WHERE bi.bid_id = b.bid_id AND bi.punk_id = pc_t.punk_id
      ))
      AND NOT EXISTS (
        SELECT 1 FROM ${bidExcludeId} be
        WHERE be.bid_id = b.bid_id AND be.punk_id = pc_t.punk_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'required'
          AND bt.trait_id NOT IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = pc_t.punk_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidTrait} bt
        WHERE bt.bid_id = b.bid_id AND bt.kind = 'forbidden'
          AND bt.trait_id IN (
            SELECT trait_id FROM ${punkTrait} WHERE punk_id = pc_t.punk_id
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidTrait} bt
          WHERE bt.bid_id = b.bid_id AND bt.kind = 'anyOf'
            AND bt.trait_id IN (
              SELECT trait_id FROM ${punkTrait} WHERE punk_id = pc_t.punk_id
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'required'
          AND bc.color_id NOT IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = pc_t.punk_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${bidColor} bc
        WHERE bc.bid_id = b.bid_id AND bc.kind = 'forbidden'
          AND bc.color_id IN (
            SELECT color_id FROM ${punkColor} WHERE punk_id = pc_t.punk_id
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
        )
        OR EXISTS (
          SELECT 1 FROM ${bidColor} bc
          WHERE bc.bid_id = b.bid_id AND bc.kind = 'anyOf'
            AND bc.color_id IN (
              SELECT color_id FROM ${punkColor} WHERE punk_id = pc_t.punk_id
            )
        )
      )
      AND (
        b.max_pixel_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = pc_t.punk_id
            AND pv.pixel_count BETWEEN b.min_pixel_count AND b.max_pixel_count
        )
      )
      AND (
        b.max_color_count = 0
        OR EXISTS (
          SELECT 1 FROM ${punkVisual} pv
          WHERE pv.punk_id = pc_t.punk_id
            AND pv.color_count BETWEEN b.min_color_count AND b.max_color_count
        )
      )
    ORDER BY b.bid_wei DESC, b.bid_id ASC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const rows = normalizeRows(result)
  return c.json({
    colorId,
    items: rows.map(serialize),
    limit,
    offset,
  })
})

// GET /bids/:bidId — single bid hydrated with criteria + include/exclude lists.
app.get('/:bidId{[0-9]+}', async (c) => {
  const bidId = BigInt(c.req.param('bidId'))
  const rows = await db
    .select()
    .from(marketBid)
    .where(eq(marketBid.bid_id, bidId))
    .limit(1)
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json(serialize(rows[0]!))
})

export default app
