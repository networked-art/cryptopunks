import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseSearchText, searchSynonyms } from '../dist/index.js'
import {
  createOfflinePunksDataClient,
  createOfflinePunksDataClientFromDataset,
  loadOfflinePunksDataFromDirectory,
  parseOfflinePunksSearchText,
} from '../dist/offline.js'
import { bundledOfflinePunksData } from '../dist/offline-data.js'
import { bundledOfflinePunksDataWithPixels } from '../dist/offline-pixel-data.js'

const DATASET_HASH =
  '0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68'

describe('OfflinePunksDataClient', () => {
  it('loads the bundled canonical dataset and exposes contract-compatible reads', async () => {
    const sdk = createOfflinePunksDataClient()

    assert.equal(sdk.getDatasetHashSync(), DATASET_HASH)
    assert.equal(await sdk.getDatasetHash(), DATASET_HASH)
    assert.equal(sdk.getTraitCountSync(), 111)
    assert.equal(sdk.getPaletteSizeSync(), 222)

    const alien = sdk.resolveTraitSync('Alien')
    assert.equal(alien.id, 0)
    assert.equal(alien.kind, 'NormalizedType')
    assert.equal(alien.supply, 9)

    const hoodie = await sdk.resolveTrait('hoodie')
    assert.equal(hoodie.id, 62)
    assert.equal(hoodie.supply, 259)

    assert.equal(
      sdk.countSync({ attributes: { required: ['Hoodie'] } }),
      hoodie.supply,
    )
    assert.deepEqual(sdk.searchSync({ text: '#8348' }), [8348])
    assert.throws(
      () => sdk.searchSync({ traits: { required: ['Hoodie'] } }),
      /search query uses attributes, not traits/,
    )

    assert.throws(
      () => sdk.getDatasetHashSync({ blockTag: 'latest' }),
      /offline data is immutable/,
    )
  })

  it('supports richer offline filters, text search, facets, sorting, and sync/async parity', async () => {
    const sdk = createOfflinePunksDataClient()

    assert.deepEqual(
      parseOfflinePunksSearchText('zombie mohawk OR ape "3d glasses"'),
      [
        [
          { text: 'zombie', exact: false },
          { text: 'mohawk', exact: false },
        ],
        [
          { text: 'ape', exact: false },
          { text: '3d glasses', exact: true },
        ],
      ],
    )

    assert.equal(sdk.countSync({ punkType: 'Alien' }), 9)
    assert.equal(sdk.countSync({ headVariant: 'Female2' }), 1174)
    assert.deepEqual(sdk.searchSync({ attributeCount: 7 }), [8348])
    assert.deepEqual(
      sdk.searchSync({ text: 'top hat mole', attributeCount: 7 }),
      [8348],
    )
    assert.equal(
      sdk.countSync({ text: '"3d glasses"' }),
      sdk.countSync({ attributes: { required: ['3D Glasses'] } }),
    )
    assert.equal(sdk.countSync({ text: '"glasses"' }), 0)
    assert.deepEqual(
      sdk.searchSync({ text: '  dArK hAiR  ' }),
      sdk.searchSync({ text: '"Dark Hair"' }),
    )
    assert.equal(
      sdk.countSync({ text: 'Dark Hair' }),
      sdk.countSync({ attributes: { required: ['Dark Hair'] } }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'big shades' }),
      sdk.searchSync({ attributes: { required: ['Big Shades'] } }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'buck teeth' }),
      sdk.searchSync({ attributes: { required: ['Buck Teeth'] } }),
    )
    assert.ok(
      sdk.countSync({ text: 'shades' }) >
        sdk.countSync({ attributes: { required: ['Big Shades'] } }),
    )
    assert.equal(sdk.countSync({ text: 'big shades wild' }), 34)
    assert.deepEqual(
      sdk.searchSync({ text: 'zombie mohawk OR ape "3d glasses"' }),
      unionIds(
        sdk.searchSync({
          attributes: {
            required: ['Zombie'],
            anyOf: ['Mohawk', 'Mohawk Dark', 'Mohawk Thin', 'Red Mohawk'],
          },
        }),
        sdk.searchSync({ attributes: { required: ['Ape', '3D Glasses'] } }),
      ),
    )

    const hoodiePage = sdk.searchSync({ text: 'hoodie', limit: 5 })
    assert.deepEqual(hoodiePage, [54, 58, 87, 90, 99])
    assert.deepEqual(await sdk.search({ text: 'hoodie', limit: 5 }), hoodiePage)

    const facets = sdk.facetsSync({ text: 'alien' })
    assert.equal(facets.total, 9)
    assert.equal(
      facets.punkTypes.find((facet) => facet.name === 'Alien').count,
      9,
    )
    assert.equal(
      facets.attributes.find((facet) => facet.name === 'Alien').count,
      9,
    )

    assert.deepEqual(
      sdk.searchSync({
        attributes: { anyOf: ['Alien', 'Ape', 'Zombie'] },
        sort: 'rarity',
        limit: 5,
      }),
      [2890, 3100, 5822, 5577, 6965],
    )
  })

  it('recognizes count and skin-tone phrases in text search', () => {
    const sdk = createOfflinePunksDataClient()

    // `<n> colors` / `<n> attributes` / `<n> pixels` constrain the
    // matching numeric axis. Match parity with the structured form.
    assert.equal(
      sdk.countSync({ text: '2 colors' }),
      sdk.countSync({ colorCount: 2 }),
    )
    assert.equal(
      sdk.countSync({ text: 'two colors' }),
      sdk.countSync({ colorCount: 2 }),
    )
    assert.equal(
      sdk.countSync({ text: 'zero attributes' }),
      sdk.countSync({ attributeCount: 0 }),
    )
    assert.equal(
      sdk.countSync({ text: '7 attributes' }),
      sdk.countSync({ attributeCount: 7 }),
    )
    assert.equal(
      sdk.countSync({ text: '>=4 colors' }),
      sdk.countSync({ colorCount: { min: 4 } }),
    )
    assert.equal(
      sdk.countSync({ text: '2-4 colors' }),
      sdk.countSync({ colorCount: { min: 2, max: 4 } }),
    )

    // The Unicode dash family folds to an ASCII hyphen, so an em or en dash
    // pasted from a rich-text source reads as the same range — there is no
    // other thing `2—4 colors` could mean.
    assert.equal(
      sdk.countSync({ text: '2—4 colors' }),
      sdk.countSync({ colorCount: { min: 2, max: 4 } }),
    )
    assert.equal(
      sdk.countSync({ text: '2–4 colors' }),
      sdk.countSync({ colorCount: { min: 2, max: 4 } }),
    )
    // A leading em dash excludes an id like a typed `-`.
    assert.deepEqual(
      sdk.searchSync({ text: 'wild hair —1' }),
      sdk.searchSync({ text: 'wild hair -1' }),
    )
    // Unicode comparators (≤ ≥) fold to their ASCII spellings.
    assert.equal(
      sdk.countSync({ text: '≥4 colors' }),
      sdk.countSync({ colorCount: { min: 4 } }),
    )
    assert.equal(
      sdk.countSync({ text: '≤3 colors' }),
      sdk.countSync({ colorCount: { max: 3 } }),
    )
    // Fullwidth digits and `＃` fold to ASCII, so a fullwidth id resolves.
    assert.deepEqual(sdk.searchSync({ text: '＃1234' }), [1234])
    assert.equal(
      sdk.countSync({ text: '２ colors' }),
      sdk.countSync({ colorCount: 2 }),
    )
    // Smart double quotes fold to `"`, so a pasted curly phrase stays exact.
    assert.deepEqual(
      sdk.searchSync({ text: '“dark hair”' }),
      sdk.searchSync({ text: '"dark hair"' }),
    )
    // A `-`/`_` joining word characters also matches the joined trait: the
    // split form `3 d glasses` finds nothing, so `3-d glasses` falls back to
    // `3d glasses` (3D Glasses), and `v-r` reaches VR.
    assert.ok(sdk.countSync({ text: '3d glasses' }) > 0)
    assert.deepEqual(
      sdk.searchSync({ text: '3-d glasses' }),
      sdk.searchSync({ text: '3d glasses' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'v-r' }),
      sdk.searchSync({ attributes: { required: ['VR'] } }),
    )

    // Skin tone covers both human genders for that slot.
    const albinos = sdk.searchSync({ text: 'albino skin' })
    assert.equal(albinos.length, 420 + 598)
    assert.equal(
      albinos.length,
      sdk.countSync({ headVariant: ['Female 4', 'Male 4'] }),
    )

    // Bare `albino` is unambiguous and acts the same.
    assert.equal(sdk.countSync({ text: 'albino' }), albinos.length)
    assert.equal(
      sdk.countSync({ text: 'skin' }),
      sdk.countSync({
        headVariant: [
          'Female 1',
          'Female 2',
          'Female 3',
          'Female 4',
          'Male 1',
          'Male 2',
          'Male 3',
          'Male 4',
        ],
      }),
    )
    assert.equal(
      sdk.countSync({ text: 'skin tone fair' }),
      sdk.countSync({ text: 'fair skin' }),
    )
    assert.equal(
      sdk.countSync({ text: 'brown' }),
      sdk.countSync({ text: 'brown skin' }),
    )
    assert.equal(
      sdk.countSync({ text: 'fair' }),
      sdk.countSync({ text: 'fair skin' }),
    )
    assert.notEqual(
      sdk.countSync({ text: 'dark' }),
      sdk.countSync({ text: 'dark skin' }),
    )

    // Include / exclude punk ids via `#id` and `-id`.
    assert.deepEqual(sdk.searchSync({ text: '#1234' }), [1234])
    assert.equal(sdk.countSync({ text: '-1234' }), 10000 - 1)
    assert.deepEqual(
      sdk.searchSync({ text: 'alien -2890' }),
      sdk
        .searchSync({ attributes: { required: ['Alien'] } })
        .filter((id) => id !== 2890),
    )
  })

  it('expands offchain folk-trait synonyms in text search', () => {
    const sdk = createOfflinePunksDataClient()

    assert.equal(searchSynonyms.marilyn, 'female "blonde bob" "hot lipstick"')
    assert.deepEqual(parseSearchText('covid punk').orGroups[0].freeTerms, [
      { text: 'medical mask', exact: true },
    ])
    assert.deepEqual(parseSearchText('zombie punks').orGroups[0].freeTerms, [
      { text: 'zombie', exact: false },
    ])

    assert.deepEqual(
      sdk.searchSync({ text: 'covid punk' }),
      sdk.searchSync({ text: '"medical mask"' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'marilyn' }),
      sdk.searchSync({ text: 'female "blonde bob" "hot lipstick"' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'marilyn punks' }),
      sdk.searchSync({ text: 'marilyn' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'claude' }),
      sdk.searchSync({ text: '"crazy hair"' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: '"helena bonham carter"' }),
      sdk.searchSync({ text: 'female "wild hair"' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'helena bonham carter sunglasses cigarette' }),
      sdk.searchSync({ text: 'female "wild hair" shades cigarette' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'crazy black-haired girls' }),
      sdk.searchSync({ text: 'female "wild hair"' }),
    )
    assert.deepEqual(
      sdk.searchSync({ text: 'sunglasses cigarette' }),
      sdk.searchSync({ text: 'shades cigarette' }),
    )
    assert.equal(
      sdk.countSync({ text: 'masks' }),
      sdk.countSync({ text: 'mask' }),
    )
  })

  it('completes an unambiguous alias prefix in text search', () => {
    const sdk = createOfflinePunksDataClient()

    const burned = sdk.searchSync({ text: 'burned' })
    assert.ok(burned.length > 0)
    // Every prefix of the only alias starting with these letters resolves to
    // the same collection — no per-length helper synonym needed.
    for (const prefix of ['bur', 'burn', 'burne']) {
      assert.deepEqual(sdk.searchSync({ text: prefix }), burned)
    }
    // A different alias of the same collection completes the same way.
    for (const prefix of ['destro', 'destroy', 'destroye']) {
      assert.deepEqual(sdk.searchSync({ text: prefix }), burned)
    }
    // A synonym prefix completes too: `claud` → `claude` → "crazy hair".
    assert.deepEqual(
      sdk.searchSync({ text: 'claud' }),
      sdk.searchSync({ text: '"crazy hair"' }),
    )

    // A prefix that also names a trait is NOT hijacked: `mus` keeps matching
    // Mustache rather than completing to the `museum` collection.
    assert.deepEqual(
      sdk.searchSync({ text: 'mus' }),
      sdk.searchSync({ text: 'mustache' }),
    )
    assert.notDeepEqual(
      sdk.searchSync({ text: 'mus' }),
      sdk.searchSync({ text: 'museum' }),
    )

    // completeSearchText mirrors the rule for UI use, and leaves guarded /
    // already-complete terms untouched.
    assert.equal(sdk.completeSearchText('bur'), 'burned')
    assert.equal(sdk.completeSearchText('mus'), 'mus')
    assert.equal(sdk.completeSearchText('burned hoodie'), 'burned hoodie')
  })

  it('hydrates summaries and decodes compressed indexed pixels', () => {
    const sdk = createOfflinePunksDataClient({
      dataset: bundledOfflinePunksDataWithPixels,
    })
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
      [
        'Female',
        'Female 2',
        '3 Attributes',
        'Blonde Bob',
        'Earring',
        'Green Eye Shadow',
      ],
    )
    assert.equal(punk.indexedPixels.length, 576)
    assert.equal(sdk.getColorAtSync(0, 0, 0), punk.indexedPixels[0])

    const rgba = sdk.getRgbaPixelsSync(0)
    assert.equal(rgba.length, 576 * 4)
    assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 0, 0])
  })

  it('keeps default bundled data search-only until pixel data is supplied', () => {
    const sdk = createOfflinePunksDataClient()

    assert.deepEqual(sdk.searchSync({ text: 'hoodie', limit: 3 }), [54, 58, 87])
    assert.throws(
      () => sdk.getIndexedPixelsSync(0),
      /offline pixel data is not loaded/,
    )
  })

  it('loads the same data from a Node directory source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'punks-offline-'))
    try {
      const manifest = JSON.parse(bundledOfflinePunksData.manifestJson)
      await writeFile(
        join(dir, 'manifest.json'),
        bundledOfflinePunksData.manifestJson,
      )
      await Promise.all(
        Object.entries(bundledOfflinePunksData.files).map(([key]) =>
          writeFile(
            join(dir, manifest.files[key]),
            Buffer.from(bundledOfflinePunksData.files[key], 'base64'),
          ),
        ),
      )

      const dataset = await loadOfflinePunksDataFromDirectory(dir, {
        includePixels: false,
      })
      const sdk = createOfflinePunksDataClientFromDataset(dataset)
      assert.equal(sdk.getDatasetHashSync(), DATASET_HASH)
      assert.deepEqual(sdk.searchSync({ attributeCount: 7 }), [8348])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

function unionIds(...groups) {
  return [...new Set(groups.flat())].sort((a, b) => a - b)
}
