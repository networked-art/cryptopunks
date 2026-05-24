import { Hono } from 'hono'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { listing, punk, punkBid } from 'ponder:schema'
import { formatEther } from 'viem'
import { memoize } from './cache'

const MARKET_STATE_TTL_MS = 10_000

type Row = Record<string, unknown>

type MarketStateResponse = {
  listed: number[]
  listed_prices: number[]
  active_bids: number[]
  legacy_wrapped: number[]
  wrapped: number[]
  generated_at: number
}

type ListedEntry = { id: number; price: number }

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
  const result = await db.execute(sql`
    SELECT l.punk_id, l.min_value_wei
    FROM ${listing} l
    JOIN ${punk} p ON p.punk_id = l.punk_id
    WHERE l.active = true
      AND p.native_owner IS NOT NULL
      AND l.seller = p.native_owner
    ORDER BY l.min_value_wei ASC, l.punk_id ASC
  `)
  return normalizeRows(result).map((row) => ({
    id: toPunkId(row.punk_id),
    price: toEthRounded(row.min_value_wei),
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

async function loadMarketState() {
  return await memoize('punks:market-state', MARKET_STATE_TTL_MS, () =>
    computeMarketState(),
  )
}

// GET /punks/market-state — compact original CryptoPunks market state.
app.get('/market-state', async (c) => {
  const data = await loadMarketState()
  c.header('cache-control', 'public, max-age=10, stale-while-revalidate=30')
  return c.json(data)
})

export default app
