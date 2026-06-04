import 'dotenv/config'
import { existsSync } from 'node:fs'
import {
  DryRunPublisher,
  StateFile,
  TwitterPublisher,
  formatError,
  log,
  runOnce,
  type Publisher,
} from './core'
import { PunksIndexer } from './punks/indexer'
import { PunksRenderer } from './punks/renderer'
import { PunksSource } from './punks/source'
import { NameResolver } from './punks/names'

const DEFAULT_INDEXER_URL = 'https://indexer.punksmarket.app'

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === 'true'

  // In the container the state file lives on a mounted volume; locally it sits
  // in the working directory.
  const stateDir = existsSync('/app/data') ? '/app/data' : '.'
  const state = new StateFile(`${stateDir}/.bot-state.json`)

  const indexer = new PunksIndexer(
    process.env.INDEXER_URL || DEFAULT_INDEXER_URL,
  )
  const source = new PunksSource(indexer, {
    startTimestamp: process.env.START_TIMESTAMP
      ? Number(process.env.START_TIMESTAMP)
      : undefined,
  })
  const renderer = new PunksRenderer({
    names: new NameResolver(process.env.RPC_URL),
    minSpendWei: process.env.MIN_SPEND_WEI
      ? BigInt(process.env.MIN_SPEND_WEI)
      : undefined,
    maxWidth: process.env.GRID_MAX_WIDTH
      ? Number(process.env.GRID_MAX_WIDTH)
      : undefined,
  })

  const publisher: Publisher = dryRun
    ? new DryRunPublisher()
    : new TwitterPublisher({
        apiKey: required('TWITTER_API_KEY'),
        apiSecret: required('TWITTER_API_SECRET'),
        accessToken: required('TWITTER_ACCESS_TOKEN'),
        accessSecret: required('TWITTER_ACCESS_SECRET'),
      })

  await runOnce({ source, renderer, publisher, state })
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

main().catch((error) => {
  log.error(formatError(error))
  process.exit(1)
})
