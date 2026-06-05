import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allHiddenTraitIds,
  hiddenIdsForTraitId,
  hiddenTraitCatalog,
  parseSearchText,
  suggestSearchText,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const data = createOfflinePunksDataClient()
const ids = (text) => data.searchSync({ text })
const labels = (text) => suggestSearchText(data, text).map((s) => s.label)
const find = (text, label) =>
  suggestSearchText(data, text).find((s) => s.label === label)

const EARRING_TRAIT_ID = data.resolveTraitSync('Earring').id
const BUCK_TEETH_TRAIT_ID = data.resolveTraitSync('Buck Teeth').id
const HOODIE_TRAIT_ID = data.resolveTraitSync('Hoodie').id

describe('hidden trait catalog', () => {
  it('has deterministic counts matching the generated union', () => {
    assert.equal(hiddenTraitCatalog.counts.punks, 10000)
    assert.equal(
      hiddenTraitCatalog.counts.punksWithHiddenTraits,
      allHiddenTraitIds.length,
    )
    assert.equal(
      hiddenTraitCatalog.counts.hiddenTraits,
      hiddenTraitCatalog.traits.length,
    )
    assert.deepEqual(
      [...allHiddenTraitIds].sort((a, b) => a - b),
      allHiddenTraitIds,
    )
  })
})

describe('hidden trait search', () => {
  it('searches the hidden union with both names', () => {
    assert.deepEqual(ids('hidden'), allHiddenTraitIds)
    assert.deepEqual(ids('invisible'), allHiddenTraitIds)
  })

  it('searches only the hidden instances for a specific accessory', () => {
    const earringIds = hiddenIdsForTraitId(EARRING_TRAIT_ID)
    const buckTeethIds = hiddenIdsForTraitId(BUCK_TEETH_TRAIT_ID)

    assert.deepEqual(ids('hidden earring'), earringIds)
    assert.deepEqual(ids('invisible buck teeth'), buckTeethIds)
    assert.ok(earringIds.includes(0))
    assert.ok(buckTeethIds.includes(998))
  })

  it('keeps ordinary trait search unchanged', () => {
    const normalEarring = ids('earring')
    assert.equal(normalEarring.length, data.resolveTraitSync('Earring').supply)
    assert.ok(
      normalEarring.length > hiddenIdsForTraitId(EARRING_TRAIT_ID).length,
    )
  })

  it('returns an explicit empty set for accessories with no hidden examples', () => {
    assert.deepEqual(hiddenIdsForTraitId(HOODIE_TRAIT_ID), [])
    assert.deepEqual(ids('hidden hoodie'), [])
  })

  it('treats non-accessory words after hidden as normal filters', () => {
    assert.deepEqual(
      ids('hidden male'),
      data.searchSync({ text: 'male', ids: allHiddenTraitIds }),
    )
  })

  it('composes hidden-specific and normal filters without broadening', () => {
    const hiddenEarringHoodies = data.searchSync({
      text: 'hoodie',
      ids: hiddenIdsForTraitId(EARRING_TRAIT_ID),
    })
    const anyHiddenHoodies = data.searchSync({
      text: 'hoodie',
      ids: allHiddenTraitIds,
    })

    assert.deepEqual(ids('hidden earring hoodie'), hiddenEarringHoodies)
    assert.notDeepEqual(ids('hidden earring hoodie'), anyHiddenHoodies)
  })

  it('intersects out-of-order text ids with hidden accessory filters', () => {
    const hiddenEarringIds = hiddenIdsForTraitId(EARRING_TRAIT_ID)
    const inside = hiddenEarringIds[0]
    const outside = allHiddenTraitIds.find(
      (id) => id > inside && !hiddenEarringIds.includes(id),
    )

    assert.ok(outside)
    assert.deepEqual(ids(`${outside} ${inside} hidden earring`), [inside])
  })

  it('unions hidden groups across OR text', () => {
    const expected = [
      ...new Set([
        ...hiddenIdsForTraitId(EARRING_TRAIT_ID),
        ...hiddenIdsForTraitId(BUCK_TEETH_TRAIT_ID),
      ]),
    ].sort((a, b) => a - b)

    assert.deepEqual(ids('hidden earring OR invisible buck teeth'), expected)
  })
})

describe('hidden trait parsing', () => {
  it('pins hidden accessories before leaving later terms on the normal path', () => {
    const group = parseSearchText('hidden earring hoodie', {
      traitResolver: data,
    }).orGroups[0]

    assert.deepEqual(group.includeIds, hiddenIdsForTraitId(EARRING_TRAIT_ID))
    assert.deepEqual(group.freeTerms, [{ text: 'hoodie', exact: false }])
  })

  it('does not fall back to all Punks with hidden traits when a known accessory has no hidden examples', () => {
    const group = parseSearchText('hidden hoodie', {
      traitResolver: data,
    }).orGroups[0]

    assert.deepEqual(group.includeIds, [])
    assert.deepEqual(group.freeTerms, [])
  })

  it('leaves non-accessories after hidden as normal terms', () => {
    const group = parseSearchText('hidden alien', {
      traitResolver: data,
    }).orGroups[0]

    assert.deepEqual(group.includeIds, allHiddenTraitIds)
    assert.deepEqual(group.freeTerms, [{ text: 'alien', exact: false }])
  })
})

describe('hidden trait suggestions', () => {
  it('suggests the hidden and invisible union searches', () => {
    const hidden = find('hid', 'Hidden traits')
    const invisible = find('invis', 'Invisible traits')

    assert.ok(hidden)
    assert.equal(hidden.query, 'hidden')
    assert.equal(hidden.count, allHiddenTraitIds.length)
    assert.ok(invisible)
    assert.equal(invisible.query, 'invisible')
    assert.equal(invisible.count, allHiddenTraitIds.length)
  })

  it('suggests hidden accessory searches with hidden counts', () => {
    const earring = find('hidden ea', 'Hidden Earring')
    const buckTeeth = find('invisible buck te', 'Invisible Buck Teeth')

    assert.ok(labels('hidden ea').includes('Hidden Earring'))
    assert.equal(earring.query, 'hidden "Earring"')
    assert.equal(earring.count, hiddenIdsForTraitId(EARRING_TRAIT_ID).length)
    assert.equal(buckTeeth.query, 'invisible "Buck Teeth"')
    assert.equal(
      buckTeeth.count,
      hiddenIdsForTraitId(BUCK_TEETH_TRAIT_ID).length,
    )
  })

  it('suggests hidden accessories after the hidden union phrase and a space', () => {
    const hidden = find('hidden ', 'Hidden Earring')
    const invisible = find('invisible ', 'Invisible Earring')
    const hiddenTraits = find('hidden traits ', 'Hidden Earring')

    assert.ok(hidden)
    assert.equal(hidden.query, 'hidden "Earring"')
    assert.equal(hidden.count, hiddenIdsForTraitId(EARRING_TRAIT_ID).length)
    assert.ok(invisible)
    assert.equal(invisible.query, 'invisible "Earring"')
    assert.ok(hiddenTraits)
    assert.equal(hiddenTraits.query, 'hidden "Earring"')
  })

  it('does not keep hidden accessory suggestions open after an accessory is selected', () => {
    assert.deepEqual(labels('hidden earring '), [])
  })

  it('round-trips hidden suggestions into searchable text', () => {
    for (const text of [
      'hid',
      'invis',
      'hidden ',
      'invisible ',
      'hidden traits ',
      'hidden ea',
      'invisible buck te',
    ]) {
      for (const suggestion of suggestSearchText(data, text)) {
        assert.doesNotThrow(() => data.searchSync({ text: suggestion.query }))
      }
    }
  })
})
