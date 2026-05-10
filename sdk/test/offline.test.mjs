import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  createOfflinePunksDataClient,
  createOfflinePunksDataClientFromDataset,
  loadOfflinePunksDataFromDirectory,
} from '../dist/offline.js'
import { bundledOfflinePunksData } from '../dist/offline-data.js'

const DATASET_HASH = '0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68'

describe('OfflinePunksDataClient', () => {
  it('loads the bundled canonical dataset and exposes contract-compatible reads', async () => {
    const sdk = createOfflinePunksDataClient()

    assert.equal(sdk.getDatasetHashSync(), DATASET_HASH)
    assert.equal(await sdk.getDatasetHash(), DATASET_HASH)
    assert.equal(sdk.isSealedSync(), true)
    assert.equal(sdk.getTraitCountSync(), 111)
    assert.equal(sdk.getPaletteSizeSync(), 222)

    const alien = sdk.resolveTraitSync('Alien')
    assert.equal(alien.id, 0)
    assert.equal(alien.kind, 'NormalizedType')
    assert.equal(alien.supply, 9)

    const hoodie = await sdk.resolveTrait('hoodie')
    assert.equal(hoodie.id, 62)
    assert.equal(hoodie.supply, 259)

    assert.equal(sdk.countSync({ traits: { required: ['Hoodie'] } }), hoodie.supply)
    assert.deepEqual(sdk.searchSync({ text: '#8348' }), [8348])

    assert.throws(
      () => sdk.getDatasetHashSync({ blockTag: 'latest' }),
      /offline data is immutable/,
    )
  })

  it('supports richer offline filters, text search, facets, sorting, and sync/async parity', async () => {
    const sdk = createOfflinePunksDataClient()

    assert.equal(sdk.countSync({ punkType: 'Alien' }), 9)
    assert.equal(sdk.countSync({ headVariant: 'Female2' }), 1174)
    assert.deepEqual(sdk.searchSync({ attributeCount: 7 }), [8348])
    assert.deepEqual(sdk.searchSync({ text: 'top hat mole', attributeCount: 7 }), [8348])

    const hoodiePage = sdk.searchSync({ text: 'hoodie', limit: 5 })
    assert.deepEqual(hoodiePage, [54, 58, 87, 90, 99])
    assert.deepEqual(await sdk.search({ text: 'hoodie', limit: 5 }), hoodiePage)

    const facets = sdk.facetsSync({ text: 'alien' })
    assert.equal(facets.total, 9)
    assert.equal(facets.punkTypes.find((facet) => facet.name === 'Alien').count, 9)
    assert.equal(facets.traits.find((facet) => facet.name === 'Alien').count, 9)

    assert.deepEqual(
      sdk.searchSync({
        traits: { anyOf: ['Alien', 'Ape', 'Zombie'] },
        sort: 'rarity',
        limit: 5,
      }),
      [2890, 3100, 5822, 5577, 6965],
    )
  })

  it('hydrates summaries and decodes compressed indexed pixels', () => {
    const sdk = createOfflinePunksDataClient()
    const punk = sdk.getPunkSync(0, {
      includeTraits: true,
      includeColors: true,
      includePixels: true,
    })

    assert.equal(punk.id, 0)
    assert.equal(punk.punkTypeName, 'Female')
    assert.equal(punk.headVariantName, 'Female 2')
    assert.deepEqual(
      punk.traits.map((trait) => trait.name),
      ['Female', 'Female 2', '3 Attributes', 'Blonde Bob', 'Earring', 'Green Eye Shadow'],
    )
    assert.equal(punk.indexedPixels.length, 576)
    assert.equal(sdk.getColorAtSync(0, 0, 0), punk.indexedPixels[0])

    const rgba = sdk.getRgbaPixelsSync(0)
    assert.equal(rgba.length, 576 * 4)
    assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 0, 0])
  })

  it('loads the same data from a Node directory source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'punks-offline-'))
    try {
      const manifest = JSON.parse(bundledOfflinePunksData.manifestJson)
      await writeFile(join(dir, 'manifest.json'), bundledOfflinePunksData.manifestJson)
      await Promise.all(
        Object.entries(manifest.files).map(([key, fileName]) =>
          writeFile(
            join(dir, fileName),
            Buffer.from(bundledOfflinePunksData.files[key], 'base64'),
          ),
        ),
      )

      const dataset = await loadOfflinePunksDataFromDirectory(dir)
      const sdk = createOfflinePunksDataClientFromDataset(dataset)
      assert.equal(sdk.getDatasetHashSync(), DATASET_HASH)
      assert.deepEqual(sdk.searchSync({ attributeCount: 7 }), [8348])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
