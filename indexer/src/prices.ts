import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Context } from 'ponder:registry'
import { backfillMarker, ethUsdPrice } from 'ponder:schema'

import { ChainlinkAggregatorAbi } from '../abis/ChainlinkAggregatorAbi'
import { CHAINLINK_ETH_USD_AGGREGATOR } from '../utils/contracts'

const SECONDS_PER_DAY = 86_400n
const WEI_PER_ETH = 1_000_000_000_000_000_000n

// Chainlink ETH/USD answers are scaled by 1e8. Cents = USD × 100, so
// cents = answer / 1e6. Kept explicit for clarity.
const CHAINLINK_TO_CENTS_DIVISOR = 1_000_000n

export const PRICE_SOURCE_CSV = 'csv:cryptocompare_v1'
export const PRICE_SOURCE_CHAINLINK = 'chainlink'

// Bump this suffix when the CSV's contents materially change so the seed
// re-runs on the next start. The CSV path resolves relative to the indexer
// package root (Ponder always runs from there in dev + Docker).
const PRE_CHAINLINK_SEED_NAME = 'eth_usd_prices_csv_v1'
const PRICES_CSV_PATH = resolve(process.cwd(), 'data', 'eth_usd_prices.csv')
const DB_INSERT_CHUNK = 500

export function dayUnix(timestamp: bigint): bigint {
  return (timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY
}

export function chainlinkAnswerToCents(answer: bigint): bigint {
  if (answer <= 0n) return 0n
  return answer / CHAINLINK_TO_CENTS_DIVISOR
}

// Seeds `eth_usd_prices` from the bundled CSV on first run. Idempotent via a
// row in `backfill_markers`. Called from the `CryptoPunksV1:setup` hook so
// the cache is warm before the first event handler fires.
export async function seedPreChainlinkPricesFromCsv(
  context: Context,
): Promise<void> {
  const existing = await context.db.find(backfillMarker, {
    name: PRE_CHAINLINK_SEED_NAME,
  })
  if (existing) return

  const rows = await readPricesCsv()
  if (rows.length === 0) {
    console.warn(
      `[indexer] eth_usd_prices CSV at ${PRICES_CSV_PATH} unreadable — sale events on pre-Chainlink days will have null usd_value_cents until the file is restored.`,
    )
    return
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const values = rows.map((r) => ({
    day_unix: r.day_unix,
    eth_usd_cents: r.eth_usd_cents,
    source: PRICE_SOURCE_CSV,
    block_number: null,
    updated_at: nowSec,
  }))

  for (const chunk of chunked(values, DB_INSERT_CHUNK)) {
    await context.db.insert(ethUsdPrice).values(chunk).onConflictDoNothing()
  }

  await context.db.insert(backfillMarker).values({
    name: PRE_CHAINLINK_SEED_NAME,
    completed_at: nowSec,
  })

  console.log(`[indexer] seeded ${values.length} ETH/USD daily prices`)
}

// Returns the USD-cent equivalent of `weiAmount` for the event's UTC day.
// Cache-first: looks up `eth_usd_prices[day_unix]`; on miss, reads
// Chainlink's `latestRoundData` at the event's block, caches it, and
// returns the cents. Returns `null` only when the wei is zero, the cache
// is empty, AND Chainlink reverts (i.e. pre-aggregator-deploy events).
export async function usdValueCentsForBlock(
  context: Context,
  block: { number: bigint; timestamp: bigint },
  weiAmount: bigint,
): Promise<bigint | null> {
  if (weiAmount === 0n) return 0n
  const day = dayUnix(block.timestamp)

  const cached = await context.db.find(ethUsdPrice, { day_unix: day })
  if (cached) return (weiAmount * cached.eth_usd_cents) / WEI_PER_ETH

  const cents = await fetchAndCacheChainlinkAt(context, day, block)
  if (cents === null) return null
  return (weiAmount * cents) / WEI_PER_ETH
}

async function fetchAndCacheChainlinkAt(
  context: Context,
  eventDay: bigint,
  block: { number: bigint; timestamp: bigint },
): Promise<bigint | null> {
  let answer: bigint
  try {
    const result = await context.client.readContract({
      address: CHAINLINK_ETH_USD_AGGREGATOR,
      abi: ChainlinkAggregatorAbi,
      functionName: 'latestRoundData',
      blockNumber: block.number,
    })
    answer = result[1]
  } catch {
    // Chainlink ETH/USD aggregator wasn't deployed before mid-2021 — the
    // call reverts for older blocks. Leave the event's USD null.
    return null
  }

  const cents = chainlinkAnswerToCents(answer)
  if (cents <= 0n) return null

  // Cache keyed by the *event's* day_unix so subsequent events on the same
  // day hit the cache. Semantically: "best ETH/USD as of the first sale
  // event on this day", which is within minutes of any Chainlink update.
  await context.db
    .insert(ethUsdPrice)
    .values({
      day_unix: eventDay,
      eth_usd_cents: cents,
      source: PRICE_SOURCE_CHAINLINK,
      block_number: block.number,
      updated_at: block.timestamp,
    })
    .onConflictDoNothing()

  return cents
}

type CsvRow = { day_unix: bigint; eth_usd_cents: bigint }

async function readPricesCsv(): Promise<CsvRow[]> {
  let raw: string
  try {
    raw = await readFile(PRICES_CSV_PATH, 'utf8')
  } catch {
    return []
  }
  const rows: CsvRow[] = []
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) continue
    if (i === 0 && line.startsWith('day_unix')) continue
    const [dayStr, centsStr] = line.split(',')
    if (!dayStr || !centsStr) continue
    const cents = BigInt(centsStr)
    if (cents <= 0n) continue
    rows.push({ day_unix: BigInt(dayStr), eth_usd_cents: cents })
  }
  return rows
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[])
  }
  return out
}
