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

describe('curated collections', () => {
  it('bundles the burned set as validated, normalized data', () => {
    assert.deepEqual(
      searchCollections.map((collection) => collection.slug),
      ['burned'],
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
      ['burned'],
    )
    assert.equal(punks.collections.has('burned'), true)
    assert.equal(punks.collections.has('museum'), false)
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
  })
})
