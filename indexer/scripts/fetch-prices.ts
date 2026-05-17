// One-shot helper to regenerate `data/eth_usd_prices.csv`. Pulls daily
// ETH/USD closes from CryptoCompare's free histoday endpoint over two calls
// (limit=2000 each) and writes a deduped, sorted CSV covering V1 launch
// through today. This script is intentionally developer-run; the indexer
// runtime never depends on a third-party API.
//
//   pnpm tsx scripts/fetch-prices.ts
//
// Re-commit `data/eth_usd_prices.csv` when you regenerate.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HISTODAY_URL = 'https://min-api.cryptocompare.com/data/v2/histoday'
const HISTODAY_LIMIT = 2000

// CryptoPunks V1 launch (2017-06-22 00:00:00 UTC).
const PUNKS_GENESIS_DAY = 1_498_089_600

type HistoDayPoint = { time: number; close: number }
type HistoDayResponse = {
  Response?: string
  Data?: { Data?: HistoDayPoint[] }
}

async function fetchBatch(toTs: number): Promise<HistoDayPoint[]> {
  const url = `${HISTODAY_URL}?fsym=ETH&tsym=USD&limit=${HISTODAY_LIMIT}&toTs=${toTs}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`histoday HTTP ${res.status}`)
  const body = (await res.json()) as HistoDayResponse
  if (body.Response !== 'Success') {
    throw new Error(`histoday Response=${body.Response}`)
  }
  return body.Data?.Data ?? []
}

async function main() {
  const now = Math.floor(Date.now() / 1000)
  const recent = await fetchBatch(now)
  if (recent.length === 0)
    throw new Error('histoday returned 0 points (recent)')
  const earliestRecent = recent[0]!.time
  const older = await fetchBatch(earliestRecent - 86_400)

  const byDay = new Map<number, number>()
  for (const point of [...older, ...recent]) {
    if (point.time < PUNKS_GENESIS_DAY) continue
    if (!point.close || point.close <= 0) continue
    byDay.set(point.time, Math.round(point.close * 100))
  }

  const rows = [...byDay.entries()].sort((a, b) => a[0] - b[0])
  const out = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'eth_usd_prices.csv',
  )
  await mkdir(dirname(out), { recursive: true })
  const lines = ['day_unix,eth_usd_cents']
  for (const [day, cents] of rows) lines.push(`${day},${cents}`)
  await writeFile(out, lines.join('\n') + '\n')

  console.log(`wrote ${rows.length} rows → ${out}`)
  console.log(`first: ${rows[0]?.[0]} → ${rows[0]?.[1]}`)
  console.log(
    `last:  ${rows[rows.length - 1]?.[0]} → ${rows[rows.length - 1]?.[1]}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
