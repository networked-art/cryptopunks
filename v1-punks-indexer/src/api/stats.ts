import { Hono } from 'hono'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { event } from 'ponder:schema'
import { memoize } from './cache'

// Rolling sale statistics over canonical rolling windows for the V1 indexer.
// Sales come from the unified `events` table (type='sale'). Unlike the V2
// indexer this dataset has no `usd_value_cents` — only wei totals are exposed.

const WINDOW_SECONDS = {
  '24h': 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60,
} as const

type Window = keyof typeof WINDOW_SECONDS
const WINDOWS = Object.keys(WINDOW_SECONDS) as Window[]

const TTL_MS: Record<Window, number> = {
  '24h': 60_000,
  '30d': 5 * 60_000,
  '90d': 15 * 60_000,
  '1y': 60 * 60_000,
}

const BUCKET_SECONDS: Record<Window, number> = {
  '24h': 60 * 60,
  '30d': 24 * 60 * 60,
  '90d': 24 * 60 * 60,
  '1y': 7 * 24 * 60 * 60,
}

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

function floorNumericString(value: unknown): string {
  if (value == null) return '0'
  const s = String(value)
  const dot = s.indexOf('.')
  if (dot === -1) return s
  const head = s.slice(0, dot)
  return head === '' || head === '-' ? '0' : head
}

type Summary = {
  count: number
  uniqueBuyers: number
  uniqueSellers: number
  uniquePunks: number
  totalWei: string
  avgWei: string
  medianWei: string
  minWei: string | null
  maxWei: string | null
}

type SourceBreakdown = {
  source: string
  count: number
  totalWei: string
}

type SeriesPoint = {
  bucketUnix: string
  count: number
  totalWei: string
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
      COUNT(*)::bigint                                                              AS count,
      COALESCE(SUM(wei_amount), 0)::numeric                                         AS total_wei,
      COALESCE(AVG(wei_amount), 0)::numeric                                         AS avg_wei,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wei_amount), 0)::numeric AS median_wei,
      MIN(wei_amount)::numeric                                                      AS min_wei,
      MAX(wei_amount)::numeric                                                      AS max_wei,
      COUNT(DISTINCT buyer)::bigint                                                 AS unique_buyers,
      COUNT(DISTINCT seller)::bigint                                                AS unique_sellers,
      COUNT(DISTINCT punk_id)::bigint                                               AS unique_punks
    FROM ${event}
    WHERE type = 'sale'
      AND wei_amount IS NOT NULL
      AND timestamp >= ${start}
      AND timestamp < ${end}
  `)
  const row = normalizeRows(result)[0] ?? {}
  return {
    count: toInt(row.count),
    uniqueBuyers: toInt(row.unique_buyers),
    uniqueSellers: toInt(row.unique_sellers),
    uniquePunks: toInt(row.unique_punks),
    totalWei: bigStr(row.total_wei),
    avgWei: floorNumericString(row.avg_wei),
    medianWei: floorNumericString(row.median_wei),
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
      COUNT(*)::bigint                      AS count,
      COALESCE(SUM(wei_amount), 0)::numeric AS total_wei
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
      COALESCE(SUM(wei_amount), 0)::numeric         AS total_wei
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
  }))
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

function getWindow(window: Window): Promise<WindowStats> {
  return memoize(`stats:${window}`, TTL_MS[window], () => computeWindow(window))
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
