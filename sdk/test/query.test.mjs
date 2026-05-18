import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compileOfferSlot,
  compilePunksFilter,
  PunkType,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const data = createOfflinePunksDataClient()

/// Quick helpers — trait ids referenced by the assertions below.
const MALE_TRAIT_ID = data.resolveTraitSync('Male').id
const STRINGY_HAIR_TRAIT_ID = data.resolveTraitSync('Stringy Hair').id
const HEAD_VARIANT_TRAIT_OFFSET = 5
const FEMALE4_TRAIT_ID = HEAD_VARIANT_TRAIT_OFFSET + 5 // HeadVariant.Female4
const MALE4_TRAIT_ID = HEAD_VARIANT_TRAIT_OFFSET + 9 // HeadVariant.Male4

const mask = (...ids) => ids.reduce((acc, id) => acc | (1n << BigInt(id)), 0n)

describe('compileOfferSlot — text-search free terms', () => {
  it('compiles a fuzzy single-match term as a required trait', () => {
    const slot = compileOfferSlot(data, { query: { text: 'stringy' } })
    assert.equal(
      slot.criteria.requiredTraitMask,
      mask(STRINGY_HAIR_TRAIT_ID),
      'stringy should compile to required(Stringy Hair)',
    )
    assert.equal(slot.criteria.anyOfTraitMask, 0n)
    assert.deepEqual(slot.includeIds, [])
    assert.deepEqual(slot.excludeIds, [])
  })

  it('prefers the canonical NormalizedType match over its head-variant siblings', () => {
    const slot = compileOfferSlot(data, { query: { text: 'male' } })
    /// `male` matches NormalizedType Male and HeadVariant Male 1..4. The
    /// canonical NormalizedType (its normalized name equals the term) subsumes
    /// the head variants, so the filter encodes just `required(Male)` and
    /// leaves the single any-of slot free for skin-tone / head intersection.
    assert.equal(
      slot.criteria.requiredTraitMask,
      mask(MALE_TRAIT_ID),
      'male should compile to required(Male) only',
    )
    assert.equal(slot.criteria.anyOfTraitMask, 0n)
  })

  it('compiles `albino stringy male` — the case that previously threw', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'albino stringy male' },
    })
    /// `albino` → skinTone=Albino → head=[Female4, Male4] → any-of group.
    /// `stringy` → required(Stringy Hair).
    /// `male` → required(Male).
    assert.equal(
      slot.criteria.requiredTraitMask,
      mask(MALE_TRAIT_ID, STRINGY_HAIR_TRAIT_ID),
    )
    assert.equal(
      slot.criteria.anyOfTraitMask,
      mask(FEMALE4_TRAIT_ID, MALE4_TRAIT_ID),
    )
  })

  it('throws when a term matches no traits at all', () => {
    assert.throws(
      () => compileOfferSlot(data, { query: { text: 'foobarbazquux' } }),
      /no trait name matches/,
    )
  })

  it('drops an any-of group that is already pinned by a required trait', () => {
    /// `wild` matches {Wild Hair, Wild Blonde, Wild White Hair} (any-of), but
    /// `white` requires Wild White Hair — which is in the `wild` group, so
    /// the group is automatically satisfied and gets dropped. The filter's
    /// single any-of slot then accepts the skin-tone-induced [Female 4,
    /// Male 4] without conflict.
    const slot = compileOfferSlot(data, {
      query: { text: 'wild white albino' },
    })
    assert.equal(
      slot.criteria.requiredTraitMask,
      mask(data.resolveTraitSync('Wild White Hair').id),
    )
    assert.equal(
      slot.criteria.anyOfTraitMask,
      mask(FEMALE4_TRAIT_ID, MALE4_TRAIT_ID),
    )
    assert.deepEqual(slot.includeIds, [])
  })

  it('falls back to includeIds when no single filter can express the query', () => {
    /// `hat` matches many Accessory traits with no canonical, and `albino`
    /// forces a second any-of group via skin tone → impossible to express as
    /// a single filter. The fallback enumerates the matching punks (46 of
    /// them, under the 64 cap) and pins them as `includeIds[]` with an empty
    /// criteria.
    const slot = compileOfferSlot(data, { query: { text: 'hat albino' } })
    const search = data.searchSync({ text: 'hat albino' })
    assert.equal(slot.criteria.requiredTraitMask, 0n)
    assert.equal(slot.criteria.anyOfTraitMask, 0n)
    assert.equal(slot.criteria.requiredColorMask, 0n)
    assert.equal(slot.criteria.anyOfColorMask, 0n)
    assert.deepEqual(slot.includeIds, search)
    assert.ok(slot.includeIds.length > 0 && slot.includeIds.length <= 64)
  })

  it('rethrows the filter error when the fallback would exceed 64 ids', () => {
    /// `beard albino` has too many matches (170) to fit in `includeIds[]`,
    /// and the filter can't be compiled either. The fallback bails so the
    /// caller sees the original filter diagnostic rather than a silently
    /// lossy bid.
    assert.throws(
      () => compileOfferSlot(data, { query: { text: 'beard albino' } }),
      /any-of trait group/,
    )
  })
})

describe('compilePunksFilter — text-search free terms', () => {
  it('compiles a query without ids the same way as compileOfferSlot', () => {
    const filter = compilePunksFilter(data, { text: 'stringy male' })
    assert.equal(
      filter.requiredTraitMask,
      mask(MALE_TRAIT_ID, STRINGY_HAIR_TRAIT_ID),
    )
    assert.equal(filter.anyOfTraitMask, 0n)
  })

  it('still accepts the structured equivalent', () => {
    const filter = compilePunksFilter(data, {
      type: PunkType.Male,
      attributes: { required: ['Stringy Hair'] },
    })
    assert.equal(
      filter.requiredTraitMask,
      mask(MALE_TRAIT_ID, STRINGY_HAIR_TRAIT_ID),
    )
  })
})
