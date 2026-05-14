import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { network } from 'hardhat'
import { type Hex } from 'viem'

import { hexToBytes } from './lib/punks-builder.js'
import { loadAndSealPunksData, readManifest, type Manifest } from './lib/sealed-punks-data.js'

const EXPORT_DIR = 'scripts/output/punks-data'
const OUTPUT_DIR = 'scripts/output/punks-grid'
const RENDER_GAS = 16_000_000n

type Filter = {
  requiredTraitMask: bigint
  forbiddenTraitMask: bigint
  anyOfTraitMask: bigint
  requiredColorMask: bigint
  forbiddenColorMask: bigint
  anyOfColorMask: bigint
  minPixelCount: number
  maxPixelCount: number
  minColorCount: number
  maxColorCount: number
}

const empty = (): Filter => ({
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
  requiredColorMask: 0n,
  forbiddenColorMask: 0n,
  anyOfColorMask: 0n,
  minPixelCount: 0,
  maxPixelCount: 0,
  minColorCount: 0,
  maxColorCount: 0,
})

type Example = {
  name: string
  description: string
  build: (lookup: TraitLookup) => Filter
}

type TraitLookup = (kind: number, name: string) => number

const KIND_HEAD = 0
const KIND_TYPE = 1
const KIND_ATTRIBUTE_COUNT = 2
const KIND_ACCESSORY = 3

const examples: Example[] = [
  {
    name: 'all',
    description: 'No filter — every Punk lit',
    build: () => empty(),
  },
  {
    name: 'aliens',
    description: 'Type = Alien (9 Punks)',
    build: (lookup) => withTrait(empty(), lookup(KIND_TYPE, 'Alien')),
  },
  {
    name: 'apes',
    description: 'Type = Ape (24 Punks)',
    build: (lookup) => withTrait(empty(), lookup(KIND_TYPE, 'Ape')),
  },
  {
    name: 'zombies',
    description: 'Type = Zombie (88 Punks)',
    build: (lookup) => withTrait(empty(), lookup(KIND_TYPE, 'Zombie')),
  },
  {
    name: 'beanies',
    description: 'Accessory = Beanie (44 Punks)',
    build: (lookup) => withTrait(empty(), lookup(KIND_ACCESSORY, 'Beanie')),
  },
  {
    name: 'seven-attributes',
    description: 'Attribute count = 7 — the single max-attribute Punk',
    build: (lookup) => withTrait(empty(), lookup(KIND_ATTRIBUTE_COUNT, '7 Attributes')),
  },
  {
    name: 'zero-attributes',
    description: 'Attribute count = 0 — the 8 plainest Punks',
    build: (lookup) => withTrait(empty(), lookup(KIND_ATTRIBUTE_COUNT, '0 Attributes')),
  },
  {
    name: 'five-plus-attributes',
    description: 'Any of {5, 6, 7} attribute counts (178 Punks)',
    build: (lookup) => {
      const f = empty()
      f.anyOfTraitMask = (1n << BigInt(lookup(KIND_ATTRIBUTE_COUNT, '5 Attributes')))
        | (1n << BigInt(lookup(KIND_ATTRIBUTE_COUNT, '6 Attributes')))
        | (1n << BigInt(lookup(KIND_ATTRIBUTE_COUNT, '7 Attributes')))
      return f
    },
  },
  {
    name: 'male-pilot-helmet',
    description: 'Type = Male AND Accessory = Pilot Helmet',
    build: (lookup) => {
      const f = empty()
      f.requiredTraitMask = (1n << BigInt(lookup(KIND_TYPE, 'Male')))
        | (1n << BigInt(lookup(KIND_ACCESSORY, 'Pilot Helmet')))
      return f
    },
  },
  {
    name: 'two-colors',
    description: 'colorCount = 2 — the 24 plainest two-color Punks',
    build: () => {
      const f = empty()
      f.minColorCount = 2
      f.maxColorCount = 2
      return f
    },
  },
  {
    name: 'colorful',
    description: 'colorCount in [10, 14] — Punks with the richest palettes',
    build: () => {
      const f = empty()
      f.minColorCount = 10
      f.maxColorCount = 14
      return f
    },
  },
  {
    name: 'big-punks',
    description: 'pixelCount in [300, 332] — Punks that fill the most pixels',
    build: () => {
      const f = empty()
      f.minPixelCount = 300
      f.maxPixelCount = 332
      return f
    },
  },
  {
    name: 'rare-rare',
    description: 'Zombie OR Ape OR Alien with beanie forbidden',
    build: (lookup) => {
      const f = empty()
      f.anyOfTraitMask = (1n << BigInt(lookup(KIND_TYPE, 'Alien')))
        | (1n << BigInt(lookup(KIND_TYPE, 'Ape')))
        | (1n << BigInt(lookup(KIND_TYPE, 'Zombie')))
      f.forbiddenTraitMask = 1n << BigInt(lookup(KIND_ACCESSORY, 'Beanie'))
      return f
    },
  },
]

async function main() {
  if (!existsSync(join(EXPORT_DIR, 'manifest.json'))) {
    throw new Error(
      `${EXPORT_DIR}/manifest.json not found. Run \`npm run generate:punks-data\` first.`,
    )
  }

  const manifest = await readManifest(EXPORT_DIR)
  const lookup = buildTraitLookup(manifest)

  console.log('Deploying PunksData against in-memory hardhat node...')
  const connection: any = await network.create()
  const { viem } = connection
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])

  console.log(`Loading sealed dataset from ${EXPORT_DIR} (this takes ~30-60s)...`)
  const startedAt = Date.now()
  await loadAndSealPunksData(data, EXPORT_DIR, manifest)
  console.log(`Sealed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)

  console.log(`Deploying PunksGrid bound to ${data.address}`)
  const grid = await viem.deployContract('PunksGrid', [data.address])

  await mkdir(OUTPUT_DIR, { recursive: true })

  for (const example of examples) {
    const filter = example.build(lookup)
    const t0 = Date.now()
    let bytes: Uint8Array
    try {
      bytes = hexToBytes(
        (await grid.read.gridPng([filter], { gas: RENDER_GAS })) as Hex,
      )
    } catch (err) {
      console.error(`  ${example.name} → FAILED:`, (err as Error).message.split('\n')[0])
      continue
    }
    const path = join(OUTPUT_DIR, `${example.name}.png`)
    await writeFile(path, bytes)
    const ms = Date.now() - t0
    console.log(`  ${example.name} → ${path} (${bytes.length} B, ${ms} ms)`)
    console.log(`    ${example.description}`)
  }

  console.log('Done.')
}

function withTrait(filter: Filter, traitId: number): Filter {
  filter.requiredTraitMask |= 1n << BigInt(traitId)
  return filter
}

function buildTraitLookup(manifest: Manifest): TraitLookup {
  const byKey = new Map<string, number>()
  for (const trait of manifest.traits) {
    byKey.set(`${trait.kind}:${trait.name}`, trait.id)
  }
  return (kind: number, name: string): number => {
    const id = byKey.get(`${kind}:${name}`)
    if (id === undefined) throw new Error(`trait not found: kind=${kind} name="${name}"`)
    return id
  }
}

await main()
