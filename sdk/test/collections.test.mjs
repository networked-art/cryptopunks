import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createPunksSdk,
  getSearchCollection,
  parseSearchText,
  searchCollections,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const BURNED = [
  685, 2317, 2761, 2838, 3493, 3808, 5041, 5237, 5449, 7755, 8611, 9146,
]

const MUSEUM = [
  74, 110, 305, 1286, 2554, 2786, 2838, 3407, 3831, 4018, 5160, 5449, 5616,
  7178, 7899, 9833,
]

const MOMA = [74, 2786, 3407, 4018, 5160, 5616, 7178, 7899]
const ZKM = [1286, 2554, 2838, 5449]

const PERFECT_AND_PRICELESS = [
  207, 269, 636, 652, 672, 722, 726, 728, 770, 795, 872, 910, 934, 1819, 2134,
  2830, 3036, 3122, 4530, 4946, 5127, 6347, 6675, 8773,
]

describe('curated collections', () => {
  it('bundles the burned set as validated, normalized data', () => {
    assert.deepEqual(
      searchCollections.map((collection) => collection.slug),
      ['burned', 'museum', 'perfect-and-priceless'],
    )

    const burned = getSearchCollection('burned')
    assert.equal(burned.title, 'Burned Punks')
    assert.equal(burned.source, 'https://burnedpunks.com')
    // `v2` in the bundle normalizes to PunkStandard.CryptoPunks.
    assert.equal(burned.standard, 0)
    assert.deepEqual(burned.ids, BURNED)
    // Ascending and deduplicated.
    assert.deepEqual(
      [...burned.ids].sort((a, b) => a - b),
      burned.ids,
    )
    assert.equal(new Set(burned.ids).size, burned.ids.length)

    assert.equal(getSearchCollection('does-not-exist'), undefined)
    assert.equal(getSearchCollection('BURNED').slug, 'burned')
  })

  it('resolves collection aliases to includeIds in text search', () => {
    assert.deepEqual(
      parseSearchText('burned punks').orGroups[0].includeIds,
      BURNED,
    )
    assert.deepEqual(parseSearchText('burned').orGroups[0].includeIds, BURNED)
    assert.deepEqual(
      parseSearchText('destroyed punks').orGroups[0].includeIds,
      BURNED,
    )
    // A whole-phrase alias leaves no free trait terms behind.
    assert.deepEqual(parseSearchText('burned punks').orGroups[0].freeTerms, [])

    // Quoting forces a literal trait lookup, never a collection match.
    const quoted = parseSearchText('"burned"').orGroups[0]
    assert.equal(quoted.includeIds, undefined)
    assert.deepEqual(quoted.freeTerms, [{ text: 'burned', exact: true }])
  })

  it('returns the burned ids from searchSync and composes with other terms', () => {
    const sdk = createOfflinePunksDataClient()

    assert.deepEqual(sdk.searchSync({ text: 'burned punks' }), BURNED)
    assert.deepEqual(sdk.searchSync({ text: 'burned' }), BURNED)
    assert.deepEqual(
      sdk.searchSync({ text: 'destroyed punks' }),
      sdk.searchSync({ text: 'burned' }),
    )

    // `includeIds` intersects with the rest of the group: no burned Punk is an
    // alien, so the AND is empty and the disjoint OR is the sum of the parts.
    assert.deepEqual(sdk.searchSync({ text: 'burned alien' }), [])
    assert.equal(
      sdk.countSync({ text: 'burned OR alien' }),
      sdk.countSync({ text: 'burned' }) + sdk.countSync({ text: 'alien' }),
    )

    // A quoted literal finds no trait named "burned".
    assert.equal(sdk.countSync({ text: '"burned"' }), 0)
  })

  it('exposes a read-only lookup facade on the sdk', () => {
    const punks = createPunksSdk()

    assert.deepEqual(
      punks.collections.list().map((collection) => collection.slug),
      ['burned', 'museum', 'perfect-and-priceless'],
    )
    assert.equal(punks.collections.has('burned'), true)
    assert.equal(punks.collections.has('museum'), true)
    assert.equal(punks.collections.has('perfect-and-priceless'), true)
    assert.equal(punks.collections.has('missing'), false)
    assert.equal(punks.collections.get('burned').ids.length, 12)
    assert.equal(punks.collections.get('missing'), undefined)

    // Callers get fresh copies; mutating one does not corrupt the bundle.
    const copy = punks.collections.get('burned')
    copy.ids.push(9999)
    copy.aliases.push('mutated')
    assert.equal(punks.collections.get('burned').ids.length, 12)
    assert.equal(
      punks.collections.get('burned').aliases.includes('mutated'),
      false,
    )
  })

  it('deep-freezes the standalone searchCollections export', () => {
    const [burned] = searchCollections
    assert.ok(Object.isFrozen(searchCollections))
    assert.ok(Object.isFrozen(burned))
    assert.ok(Object.isFrozen(burned.ids))
    assert.ok(Object.isFrozen(burned.aliases))

    // The shared bundle can't be corrupted through the direct export.
    assert.throws(() => burned.ids.push(9999), TypeError)
    assert.throws(() => searchCollections.push(burned), TypeError)
    assert.equal(getSearchCollection('burned').ids.length, 12)

    // The freeze reaches into nested institutions too.
    const museum = searchCollections.find((c) => c.slug === 'museum')
    assert.ok(Object.isFrozen(museum.institutions))
    assert.ok(Object.isFrozen(museum.institutions[0]))
    assert.ok(Object.isFrozen(museum.institutions[0].ids))
    assert.throws(() => museum.institutions[0].ids.push(1), TypeError)
  })

  it('nests museum institutions and resolves each on its own', () => {
    const museum = getSearchCollection('museum')
    assert.equal(museum.title, 'Museum Punks')
    assert.equal(museum.standard, 0)
    // The collection id set is the union of its institutions.
    assert.deepEqual(museum.ids, MUSEUM)
    assert.deepEqual(
      museum.institutions.map((institution) => institution.slug),
      ['centrepompidou', 'icam', 'lacma', 'moma', 'tma', 'zkm'],
    )
    const moma = museum.institutions.find((i) => i.slug === 'moma')
    assert.equal(moma.title, 'Museum of Modern Art (MoMA)')
    assert.deepEqual(moma.ids, MOMA)
    // A flat collection has no institutions.
    assert.equal(getSearchCollection('burned').institutions, undefined)
  })

  it('searches the whole museum set and individual institutions', () => {
    const sdk = createOfflinePunksDataClient()

    assert.deepEqual(sdk.searchSync({ text: 'museum punks' }), MUSEUM)
    // Institution name and abbreviation, case-insensitively.
    assert.deepEqual(sdk.searchSync({ text: 'MOMA' }), MOMA)
    assert.deepEqual(sdk.searchSync({ text: 'museum of modern art' }), MOMA)
    assert.deepEqual(sdk.searchSync({ text: 'zkm' }), ZKM)
    assert.deepEqual(sdk.searchSync({ text: 'pompidou' }), [110])
    assert.deepEqual(sdk.searchSync({ text: 'toledo museum of art' }), [9833])

    // Both ZKM Punks #2838 and #5449 are also burned (sent to the market
    // contract), so the two sets overlap exactly there.
    assert.deepEqual(
      sdk.searchSync({ text: 'zkm' }).filter((id) => BURNED.includes(id)),
      [2838, 5449],
    )
  })

  it('resolves the Perfect & Priceless set under all its names', () => {
    const collection = getSearchCollection('perfect-and-priceless')
    assert.equal(collection.title, 'Perfect & Priceless Punks')
    assert.equal(
      collection.source,
      'https://www.katevassgalerie.com/perfect-and-priceless',
    )
    assert.equal(collection.standard, 0)
    assert.deepEqual(collection.ids, PERFECT_AND_PRICELESS)

    const sdk = createOfflinePunksDataClient()
    // The gallery name (with `&` and spelled-out `and`), the gallery, and the
    // informal "paper" name all resolve to the same set.
    for (const phrase of [
      'perfect & priceless',
      'perfect and priceless',
      'kate vass',
      'kate vass galerie',
      'paper punks',
      'paper',
    ]) {
      assert.deepEqual(
        sdk.searchSync({ text: phrase }),
        PERFECT_AND_PRICELESS,
        `"${phrase}" should resolve to the Perfect & Priceless set`,
      )
    }
  })
})
