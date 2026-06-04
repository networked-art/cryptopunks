import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { isAddress, type Address } from 'viem'
import { log } from './core'
import { PunksIndexer } from './punks/indexer'
import { PunksRenderer } from './punks/renderer'
import { NameResolver } from './punks/names'
import type { Acquisition } from './punks/source'

const DEFAULT_INDEXER_URL = 'https://indexer.punksmarket.app'

/// Renders one acquisition to a PNG without touching Twitter or the bot cursor —
/// the way to eyeball a grid before credentials exist.
///
///   pnpm preview 0xabc…           render the address's collection
///   pnpm preview 0xabc… --new 1,2 highlight punks #1 and #2 as just-acquired
///   pnpm preview --ids 1,2,3 --new 1   render an explicit set, no indexer
///   pnpm preview 0xabc… --out grid.png
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.address && !args.ids) {
    log.info(
      'usage: pnpm preview <address> [--new id,id] [--ids id,id] [--out file.png]',
    )
    return
  }

  const indexer = new PunksIndexer(
    process.env.INDEXER_URL || DEFAULT_INDEXER_URL,
  )

  const owned =
    args.ids ?? (await indexer.ownedPunks([args.address as Address]))
  if (owned.length === 0) {
    log.info('No punks found for that account.')
    return
  }
  const acquired = (args.new ?? [owned[0]]).filter((id) => owned.includes(id))

  const acquisition: Acquisition = {
    account: (args.address ??
      '0x0000000000000000000000000000000000000000') as Address,
    acquired,
    owned,
    spentWei: 0n,
    spentUsdCents: null,
    newCollector: acquired.length === owned.length,
  }

  const renderer = new PunksRenderer({
    names: new NameResolver(process.env.RPC_URL),
    maxWidth: process.env.GRID_MAX_WIDTH
      ? Number(process.env.GRID_MAX_WIDTH)
      : undefined,
  })
  const post = await renderer.render(acquisition)
  if (!post?.media) {
    log.info('Nothing to render.')
    return
  }

  writeFileSync(args.out, post.media.data)
  log.info(`\n${post.text}\n`)
  log.info(
    `Wrote ${owned.length}-punk grid (${acquired.length} enlarged) to ${args.out}`,
  )
}

interface Args {
  address?: string
  ids?: number[]
  new?: number[]
  out: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: 'preview.png' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--new') args.new = parseIds(argv[++i])
    else if (arg === '--ids') args.ids = parseIds(argv[++i])
    else if (arg === '--out') args.out = argv[++i] ?? args.out
    else if (isAddress(arg)) args.address = arg
  }
  return args
}

function parseIds(value: string | undefined): number[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id))
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
