// One-shot helper to regenerate `data/eth_usd_pre_chainlink.csv`. Pulls daily
// ETH/USD closes from CryptoCompare's free histoday endpoint and trims to the
// pre-Chainlink window (2017-06-22 → 2021-07-20). This script is intentionally
// developer-run; the indexer runtime never depends on a third-party API.
//
//   pnpm tsx scripts/fetch-pre-chainlink-prices.ts
//
// Re-commit the CSV when you regenerate.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HISTODAY_URL = 'https://min-api.cryptocompare.com/data/v2/histoday'
const HISTODAY_LIMIT = 1500
const HISTODAY_TO_TS = 1_626_739_200 // 2021-07-20 00:00:00 UTC

const PUNKS_GENESIS_DAY = 1_498_089_600 // 2017-06-22 00:00:00 UTC
const CUTOFF_DAY = 1_626_739_200

type HistoDayPoint = { time: number; close: number }
type HistoDayResponse = {
  Response?: string
  Data?: { Data?: HistoDayPoint[] }
}

async function main() {
  const url = `${HISTODAY_URL}?fsym=ETH&tsym=USD&limit=${HISTODAY_LIMIT}&toTs=${HISTODAY_TO_TS}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`histoday HTTP ${res.status}`)
  const body = (await res.json()) as HistoDayResponse
  if (body.Response !== 'Success') {
    throw new Error(`histoday Response=${body.Response}`)
  }
  const points = body.Data?.Data ?? []
  if (points.length === 0) throw new Error('histoday returned 0 points')

  const rows = points
    .filter((p) => p.time >= PUNKS_GENESIS_DAY && p.time <= CUTOFF_DAY)
    .filter((p) => p.close > 0)
    .map((p) => ({
      day_unix: p.time,
      eth_usd_cents: Math.round(p.close * 100),
    }))
    .sort((a, b) => a.day_unix - b.day_unix)

  const out = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'eth_usd_pre_chainlink.csv',
  )
  await mkdir(dirname(out), { recursive: true })
  const lines = ['day_unix,eth_usd_cents']
  for (const r of rows) lines.push(`${r.day_unix},${r.eth_usd_cents}`)
  await writeFile(out, lines.join('\n') + '\n')

  console.log(`wrote ${rows.length} rows → ${out}`)
  console.log(`first: ${rows[0]?.day_unix} → ${rows[0]?.eth_usd_cents}`)
  console.log(
    `last:  ${rows[rows.length - 1]?.day_unix} → ${rows[rows.length - 1]?.eth_usd_cents}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
