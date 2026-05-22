import { Hono } from 'hono'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { listing, punk, punkBid } from 'ponder:schema'
import { memoize } from './cache'

const BACKGROUNDS_TTL_MS = 10_000

type Row = Record<string, unknown>

type BackgroundsResponse = {
  listed: number[]
  active_bids: number[]
  generated_at: number
}

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

async function loadListedPunkIds(): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT l.punk_id
    FROM ${listing} l
    JOIN ${punk} p ON p.punk_id = l.punk_id
    WHERE l.active = true
      AND p.native_owner IS NOT NULL
      AND l.seller = p.native_owner
    ORDER BY l.punk_id ASC
  `)
  return normalizeRows(result).map((row) => toPunkId(row.punk_id))
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

async function computeBackgrounds(): Promise<BackgroundsResponse> {
  const [listed, activeBids] = await Promise.all([
    loadListedPunkIds(),
    loadActiveBidPunkIds(),
  ])

  return {
    listed,
    active_bids: activeBids,
    generated_at: Date.now(),
  }
}

const app = new Hono()

// GET /punks/backgrounds — compact state backgrounds.
app.get('/backgrounds', async (c) => {
  const data = await memoize('punks:backgrounds', BACKGROUNDS_TTL_MS, () =>
    computeBackgrounds(),
  )
  c.header('cache-control', 'public, max-age=10, stale-while-revalidate=30')
  return c.json(data)
})

export default app
