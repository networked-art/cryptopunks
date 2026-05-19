import { Hono } from 'hono'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { event } from 'ponder:schema'
import { memoize } from './cache'

// Rolling sale statistics over a few canonical windows. All queries hit the
// same `events` table (type='sale', wei_amount IS NOT NULL) — `usd_value_cents`
// is denormalized onto the row at indexing time, so a window summary is a
// single aggregate read against the type/timestamp index, plus two tiny GROUP
// BYs for the source breakdown and the time series.

const WINDOW_SECONDS = {
  '24h': 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60,
} as const

type Window = keyof typeof WINDOW_SECONDS
const WINDOWS = Object.keys(WINDOW_SECONDS) as Window[]

// Per-window TTL: bigger windows shift more slowly, so cache longer.
const TTL_MS: Record<Window, number> = {
  '24h': 60_000,
  '30d': 5 * 60_000,
  '90d': 15 * 60_000,
  '1y': 60 * 60_000,
}

// Time-series bucket size per window — picked so each window has a usable
// number of points without exploding the row count.
const BUCKET_SECONDS: Record<Window, number> = {
  '24h': 60 * 60,
  '30d': 24 * 60 * 60,
  '90d': 24 * 60 * 60,
  '1y': 7 * 24 * 60 * 60,
}

// Calendar-aware buckets for the full-history /stats/history endpoint. The
// underlying truncation runs `date_trunc(<key>, ts AT TIME ZONE 'UTC')` so
// every bucket is UTC-aligned regardless of server timezone.
const INTERVALS = ['hour', 'day', 'week', 'month', 'year'] as const
type Interval = (typeof INTERVALS)[number]

const HISTORY_DEFAULT_LIMIT = 52
const HISTORY_MAX_LIMIT = 500
const HISTORY_TTL_MS = 60_000

type Row = Record<string, unknown>

function normalizeRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[]
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: Row[] }).rows
  }
  return []
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

function nullableBigStr(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function bigStr(value: unknown): string {
  return value == null ? '0' : String(value)
}

function toInt(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number.parseInt(String(value), 10)
}

type Summary = {
  count: number
  uniqueBuyers: number
  uniqueSellers: number
  uniquePunks: number
  totalWei: string
  totalUsdCents: string
  avgWei: string
  avgUsdCents: string
  medianWei: string
  medianUsdCents: string
  minWei: string | null
  maxWei: string | null
}

type SourceBreakdown = {
  source: string
  count: number
  totalWei: string
  totalUsdCents: string
}

type SeriesPoint = {
  bucketUnix: string
  count: number
  totalWei: string
  totalUsdCents: string
}

type WindowStats = {
  window: Window
  startUnix: string
  endUnix: string
  bucketSeconds: number
  sales: Summary
  bySource: SourceBreakdown[]
  series: SeriesPoint[]
  generatedAt: number
  cacheTtlMs: number
}

async function loadSummary(start: bigint, end: bigint): Promise<Summary> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::bigint                                                                   AS count,
      COALESCE(SUM(wei_amount), 0)::numeric                                              AS total_wei,
      COALESCE(SUM(usd_value_cents), 0)::numeric                                         AS total_usd_cents,
      COALESCE(AVG(wei_amount), 0)::numeric                                              AS avg_wei,
      COALESCE(AVG(usd_value_cents), 0)::numeric                                         AS avg_usd_cents,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wei_amount), 0)::numeric      AS median_wei,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY usd_value_cents), 0)::numeric AS median_usd_cents,
      MIN(wei_amount)::numeric                                                           AS min_wei,
      MAX(wei_amount)::numeric                                                           AS max_wei,
      COUNT(DISTINCT buyer)::bigint                                                      AS unique_buyers,
      COUNT(DISTINCT seller)::bigint                                                     AS unique_sellers,
      COUNT(DISTINCT punk_id)::bigint                                                    AS unique_punks
    FROM ${event}
    WHERE type = 'sale'
      AND wei_amount IS NOT NULL
      AND timestamp >= ${start}
      AND timestamp < ${end}
  `)
  const row = normalizeRows(result)[0] ?? {}
  // PERCENTILE_CONT/AVG over integer numerics return numeric/decimal — floor
  // to integer wei/cents so callers get clean stringified bigints.
  return {
    count: toInt(row.count),
    uniqueBuyers: toInt(row.unique_buyers),
    uniqueSellers: toInt(row.unique_sellers),
    uniquePunks: toInt(row.unique_punks),
    totalWei: bigStr(row.total_wei),
    totalUsdCents: bigStr(row.total_usd_cents),
    avgWei: floorNumericString(row.avg_wei),
    avgUsdCents: floorNumericString(row.avg_usd_cents),
    medianWei: floorNumericString(row.median_wei),
    medianUsdCents: floorNumericString(row.median_usd_cents),
    minWei: nullableBigStr(row.min_wei),
    maxWei: nullableBigStr(row.max_wei),
  }
}

async function loadBySource(
  start: bigint,
  end: bigint,
): Promise<SourceBreakdown[]> {
  const result = await db.execute(sql`
    SELECT
      source,
      COUNT(*)::bigint                          AS count,
      COALESCE(SUM(wei_amount), 0)::numeric     AS total_wei,
      COALESCE(SUM(usd_value_cents), 0)::numeric AS total_usd_cents
    FROM ${event}
    WHERE type = 'sale'
      AND wei_amount IS NOT NULL
      AND timestamp >= ${start}
      AND timestamp < ${end}
    GROUP BY source
    ORDER BY total_wei DESC
  `)
  return normalizeRows(result).map((row) => ({
    source: String(row.source),
    count: toInt(row.count),
    totalWei: bigStr(row.total_wei),
    totalUsdCents: bigStr(row.total_usd_cents),
  }))
}

async function loadSeries(
  start: bigint,
  end: bigint,
  bucketSeconds: number,
): Promise<SeriesPoint[]> {
  const bucket = BigInt(bucketSeconds)
  const result = await db.execute(sql`
    SELECT
      ((timestamp / ${bucket}) * ${bucket})::bigint AS bucket_unix,
      COUNT(*)::bigint                              AS count,
      COALESCE(SUM(wei_amount), 0)::numeric         AS total_wei,
      COALESCE(SUM(usd_value_cents), 0)::numeric    AS total_usd_cents
    FROM ${event}
    WHERE type = 'sale'
      AND wei_amount IS NOT NULL
      AND timestamp >= ${start}
      AND timestamp < ${end}
    GROUP BY bucket_unix
    ORDER BY bucket_unix
  `)
  return normalizeRows(result).map((row) => ({
    bucketUnix: bigStr(row.bucket_unix),
    count: toInt(row.count),
    totalWei: bigStr(row.total_wei),
    totalUsdCents: bigStr(row.total_usd_cents),
  }))
}

// PERCENTILE_CONT and AVG return fractional numerics. We expose wei/cents as
// integer strings — floor to drop the fractional tail without going through
// JS Number precision.
function floorNumericString(value: unknown): string {
  if (value == null) return '0'
  const s = String(value)
  const dot = s.indexOf('.')
  if (dot === -1) return s
  const head = s.slice(0, dot)
  return head === '' || head === '-' ? '0' : head
}

async function computeWindow(window: Window): Promise<WindowStats> {
  const span = BigInt(WINDOW_SECONDS[window])
  const end = nowSeconds()
  const start = end - span

  const [sales, bySource, series] = await Promise.all([
    loadSummary(start, end),
    loadBySource(start, end),
    loadSeries(start, end, BUCKET_SECONDS[window]),
  ])

  return {
    window,
    startUnix: start.toString(),
    endUnix: end.toString(),
    bucketSeconds: BUCKET_SECONDS[window],
    sales,
    bySource,
    series,
    generatedAt: Date.now(),
    cacheTtlMs: TTL_MS[window],
  }
}

// Cache key is keyed only by window — body shape is deterministic.
function getWindow(window: Window): Promise<WindowStats> {
  return memoize(`stats:${window}`, TTL_MS[window], () => computeWindow(window))
}

// ---- History (interval-bucketed full-history series) ---------------------

type HistoryBucket = {
  bucketUnix: string
  count: number
  uniqueBuyers: number
  uniqueSellers: number
  uniquePunks: number
  totalWei: string
  totalUsdCents: string
  avgWei: string
  avgUsdCents: string
  medianWei: string
  medianUsdCents: string
  minWei: string | null
  maxWei: string | null
}

type HistoryQuery = {
  interval: Interval
  limit: number
  cursor: bigint | null
  from: bigint | null
  to: bigint | null
  order: 'asc' | 'desc'
  source: string | null
}

type HistoryPage = {
  interval: Interval
  limit: number
  order: 'asc' | 'desc'
  items: HistoryBucket[]
  nextCursor: string | null
  generatedAt: number
  cacheTtlMs: number
}

// Given an interval and a bucket-start unix (cursor), return the start of the
// next bucket. Used to translate an ASC cursor into a tight timestamp lower
// bound so the aggregate only scans rows belonging to subsequent buckets.
function nextBucketStart(cursor: bigint, interval: Interval): bigint {
  if (interval === 'hour') return cursor + 3600n
  if (interval === 'day') return cursor + 86400n
  if (interval === 'week') return cursor + 604800n
  const d = new Date(Number(cursor) * 1000)
  if (interval === 'month') {
    return BigInt(
      Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000),
    )
  }
  // year
  return BigInt(Math.floor(Date.UTC(d.getUTCFullYear() + 1, 0, 1) / 1000))
}

async function loadHistory(query: HistoryQuery): Promise<HistoryBucket[]> {
  // Validated against INTERVALS — safe to embed as a SQL literal.
  const bucketExpr = sql.raw(
    `extract(epoch from (date_trunc('${query.interval}', to_timestamp(timestamp) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))::bigint`,
  )

  // Tight timestamp bounds derived from cursor + user filters, so the inner
  // aggregate scans the minimum set of rows.
  const lowerBounds: bigint[] = []
  const upperBounds: bigint[] = []
  if (query.from !== null) lowerBounds.push(query.from)
  if (query.to !== null) upperBounds.push(query.to)
  if (query.cursor !== null) {
    if (query.order === 'desc') upperBounds.push(query.cursor)
    else lowerBounds.push(nextBucketStart(query.cursor, query.interval))
  }
  const tsLower = lowerBounds.length > 0 ? maxBigInt(lowerBounds) : null
  const tsUpper = upperBounds.length > 0 ? minBigInt(upperBounds) : null

  const conds = [sql`type = 'sale'`, sql`wei_amount IS NOT NULL`]
  if (tsLower !== null) conds.push(sql`timestamp >= ${tsLower}`)
  if (tsUpper !== null) conds.push(sql`timestamp < ${tsUpper}`)
  if (query.source !== null) conds.push(sql`source = ${query.source}`)

  const whereClause = conds.reduce((acc, cond, i) =>
    i === 0 ? cond : sql`${acc} AND ${cond}`,
  )

  const orderDir = sql.raw(query.order === 'asc' ? 'ASC' : 'DESC')

  const result = await db.execute(sql`
    SELECT
      ${bucketExpr}                                                                      AS bucket_unix,
      COUNT(*)::bigint                                                                   AS count,
      COALESCE(SUM(wei_amount), 0)::numeric                                              AS total_wei,
      COALESCE(SUM(usd_value_cents), 0)::numeric                                         AS total_usd_cents,
      COALESCE(AVG(wei_amount), 0)::numeric                                              AS avg_wei,
      COALESCE(AVG(usd_value_cents), 0)::numeric                                         AS avg_usd_cents,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wei_amount), 0)::numeric      AS median_wei,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY usd_value_cents), 0)::numeric AS median_usd_cents,
      MIN(wei_amount)::numeric                                                           AS min_wei,
      MAX(wei_amount)::numeric                                                           AS max_wei,
      COUNT(DISTINCT buyer)::bigint                                                      AS unique_buyers,
      COUNT(DISTINCT seller)::bigint                                                     AS unique_sellers,
      COUNT(DISTINCT punk_id)::bigint                                                    AS unique_punks
    FROM ${event}
    WHERE ${whereClause}
    GROUP BY bucket_unix
    ORDER BY bucket_unix ${orderDir}
    LIMIT ${query.limit}
  `)

  return normalizeRows(result).map((row) => ({
    bucketUnix: bigStr(row.bucket_unix),
    count: toInt(row.count),
    uniqueBuyers: toInt(row.unique_buyers),
    uniqueSellers: toInt(row.unique_sellers),
    uniquePunks: toInt(row.unique_punks),
    totalWei: bigStr(row.total_wei),
    totalUsdCents: bigStr(row.total_usd_cents),
    avgWei: floorNumericString(row.avg_wei),
    avgUsdCents: floorNumericString(row.avg_usd_cents),
    medianWei: floorNumericString(row.median_wei),
    medianUsdCents: floorNumericString(row.median_usd_cents),
    minWei: nullableBigStr(row.min_wei),
    maxWei: nullableBigStr(row.max_wei),
  }))
}

function maxBigInt(values: bigint[]): bigint {
  let result = values[0]!
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > result) result = values[i]!
  }
  return result
}

function minBigInt(values: bigint[]): bigint {
  let result = values[0]!
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < result) result = values[i]!
  }
  return result
}

function isInterval(value: string): value is Interval {
  return (INTERVALS as readonly string[]).includes(value)
}

function historyCacheKey(query: HistoryQuery): string {
  return [
    'history',
    query.interval,
    query.limit,
    query.cursor?.toString() ?? '_',
    query.from?.toString() ?? '_',
    query.to?.toString() ?? '_',
    query.order,
    query.source ?? '_',
  ].join(':')
}

async function getHistory(query: HistoryQuery): Promise<HistoryPage> {
  const items = await memoize(historyCacheKey(query), HISTORY_TTL_MS, () =>
    loadHistory({ ...query, limit: query.limit + 1 }),
  )
  // We over-fetched by 1; if we got it, there's a next page.
  const hasMore = items.length > query.limit
  const trimmed = hasMore ? items.slice(0, query.limit) : items
  const last = trimmed[trimmed.length - 1]
  return {
    interval: query.interval,
    limit: query.limit,
    order: query.order,
    items: trimmed,
    nextCursor: hasMore && last ? last.bucketUnix : null,
    generatedAt: Date.now(),
    cacheTtlMs: HISTORY_TTL_MS,
  }
}

function parsePositiveBigInt(value: string | undefined): bigint | null {
  if (value === undefined) return null
  if (!/^\d+$/.test(value)) return null
  return BigInt(value)
}

function parseLimit(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, max)
}

const app = new Hono()

// GET /stats — compact summary across all windows (no time series).
app.get('/', async (c) => {
  const all = await Promise.all(WINDOWS.map(getWindow))
  const windows: Record<Window, Omit<WindowStats, 'series'>> = {} as never
  for (const stats of all) {
    const { series: _series, ...rest } = stats
    windows[stats.window] = rest
  }
  return c.json({ windows })
})

// GET /stats/history/:interval — full-history bucketed series with cursor
// pagination. Each item is one calendar bucket (UTC-aligned). Query params:
//   ?limit=&cursor=&from=&to=&order=asc|desc&source=
// `cursor` is the `nextCursor` returned by the previous page. `from`/`to`
// are inclusive/exclusive unix-second bounds. Default order is `desc`
// (newest first); pass `order=asc` for chronological pagination.
app.get('/history/:interval', async (c) => {
  const param = c.req.param('interval')
  if (!isInterval(param)) {
    return c.json({ error: 'invalid_interval', valid: INTERVALS }, 400)
  }
  const orderParam = c.req.query('order') ?? 'desc'
  if (orderParam !== 'asc' && orderParam !== 'desc') {
    return c.json({ error: 'invalid_order', valid: ['asc', 'desc'] }, 400)
  }

  const query: HistoryQuery = {
    interval: param,
    limit: parseLimit(
      c.req.query('limit'),
      HISTORY_DEFAULT_LIMIT,
      HISTORY_MAX_LIMIT,
    ),
    cursor: parsePositiveBigInt(c.req.query('cursor')),
    from: parsePositiveBigInt(c.req.query('from')),
    to: parsePositiveBigInt(c.req.query('to')),
    order: orderParam,
    source: c.req.query('source') ?? null,
  }

  const page = await getHistory(query)
  return c.json(page)
})

// GET /stats/:window — single window with time series.
app.get('/:window', async (c) => {
  const param = c.req.param('window')
  if (!isWindow(param)) {
    return c.json({ error: 'invalid_window', valid: WINDOWS }, 400)
  }
  const stats = await getWindow(param)
  return c.json(stats)
})

function isWindow(value: string): value is Window {
  return (WINDOWS as readonly string[]).includes(value)
}

export default app
