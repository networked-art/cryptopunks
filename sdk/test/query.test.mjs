import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compileOfferSlot,
  compilePunksFilter,
  emptyPunksFilter,
  hiddenIdsForTraitId,
  PunkType,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const data = createOfflinePunksDataClient()

/// Quick helpers — trait ids referenced by the assertions below.
const MALE_TRAIT_ID = data.resolveTraitSync('Male').id
const FEMALE_TRAIT_ID = data.resolveTraitSync('Female').id
const STRINGY_HAIR_TRAIT_ID = data.resolveTraitSync('Stringy Hair').id
const BLONDE_BOB_TRAIT_ID = data.resolveTraitSync('Blonde Bob').id
const GOLD_CHAIN_TRAIT_ID = data.resolveTraitSync('Gold Chain').id
const HOT_LIPSTICK_TRAIT_ID = data.resolveTraitSync('Hot Lipstick').id
const MEDICAL_MASK_TRAIT_ID = data.resolveTraitSync('Medical Mask').id
const MOHAWK_TRAIT_ID = data.resolveTraitSync('Mohawk').id
const BEANIE_TRAIT_ID = data.resolveTraitSync('Beanie').id
const HOODIE_TRAIT_ID = data.resolveTraitSync('Hoodie').id
const BIG_SHADES_TRAIT_ID = data.resolveTraitSync('Big Shades').id
const BUCK_TEETH_TRAIT_ID = data.resolveTraitSync('Buck Teeth').id
const DARK_HAIR_TRAIT_ID = data.resolveTraitSync('Dark Hair').id
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

  it('compiles `human` to the any-of head-variant set (male or female)', () => {
    const slot = compileOfferSlot(data, { query: { text: 'human' } })
    /// `human` → every skin-tone slot → HeadVariant Female 1..4 + Male 1..4 as a
    /// single any-of group, with no required traits. This is "male OR female",
    /// which a plain AND-joined synonym could never express.
    const humanHeadVariantMask = mask(
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((v) => HEAD_VARIANT_TRAIT_OFFSET + v),
    )
    assert.equal(slot.criteria.requiredTraitMask, 0n)
    assert.equal(slot.criteria.anyOfTraitMask, humanHeadVariantMask)
  })

  it('compiles whole exact trait-name text as one required trait', () => {
    const bigShades = compileOfferSlot(data, { query: { text: 'big shades' } })
    assert.equal(
      bigShades.criteria.requiredTraitMask,
      mask(BIG_SHADES_TRAIT_ID),
    )
    assert.equal(bigShades.criteria.anyOfTraitMask, 0n)
    assert.deepEqual(bigShades.includeIds, [])

    const buckTeeth = compileOfferSlot(data, { query: { text: 'buck teeth' } })
    assert.equal(
      buckTeeth.criteria.requiredTraitMask,
      mask(BUCK_TEETH_TRAIT_ID),
    )
    assert.equal(buckTeeth.criteria.anyOfTraitMask, 0n)
    assert.deepEqual(buckTeeth.includeIds, [])

    const darkHair = compileOfferSlot(data, {
      query: { text: '  dArK hAiR  ' },
    })
    assert.equal(darkHair.criteria.requiredTraitMask, mask(DARK_HAIR_TRAIT_ID))
    assert.equal(darkHair.criteria.anyOfTraitMask, 0n)
    assert.deepEqual(darkHair.includeIds, [])
  })

  it('keeps added terms on the normal fuzzy text path', () => {
    const slot = compileOfferSlot(data, { query: { text: 'big shades wild' } })
    assert.equal(slot.criteria.requiredTraitMask, 0n)
    assert.equal(slot.criteria.anyOfTraitMask, 0n)
    assert.deepEqual(
      slot.includeIds,
      data.searchSync({ text: 'big shades wild' }),
    )
  })

  it('compiles exact trait OR text as one any-of group', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'Beanie or Hoodie' },
    })
    assert.equal(slot.criteria.requiredTraitMask, 0n)
    assert.equal(
      slot.criteria.anyOfTraitMask,
      mask(BEANIE_TRAIT_ID, HOODIE_TRAIT_ID),
    )
    assert.deepEqual(slot.includeIds, [])
    assert.deepEqual(slot.excludeIds, [])
  })

  it('compiles multi-word exact traits inside OR text', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'Big Shades or Hoodie' },
    })
    assert.equal(slot.criteria.requiredTraitMask, 0n)
    assert.equal(
      slot.criteria.anyOfTraitMask,
      mask(BIG_SHADES_TRAIT_ID, HOODIE_TRAIT_ID),
    )
    assert.deepEqual(slot.includeIds, [])
  })

  it('rejects OR text with non-trait constraints', () => {
    assert.throws(
      () => compileOfferSlot(data, { query: { text: 'Beanie or 2 colors' } }),
      /OR groups/,
    )
  })

  it('compiles spelled-out count words like their numeric equivalent', () => {
    const numeric = compileOfferSlot(data, { query: { text: '2 colors' } })
    const spelled = compileOfferSlot(data, { query: { text: 'two colors' } })
    assert.equal(spelled.criteria.minColorCount, 2)
    assert.equal(spelled.criteria.maxColorCount, 2)
    assert.deepEqual(spelled, numeric)
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

  it('keeps collection-only text as an exact includeIds slot', () => {
    const slot = compileOfferSlot(data, { query: { text: 'burned' } })
    assert.deepEqual(slot.criteria, emptyPunksFilter())
    assert.deepEqual(slot.includeIds, data.searchSync({ text: 'burned' }))
    assert.equal(slot.includeIds.length, 12)
  })

  it('keeps small hidden-trait text as an exact includeIds slot', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'hidden buck teeth' },
    })

    assert.deepEqual(slot.criteria, emptyPunksFilter())
    assert.deepEqual(slot.includeIds, hiddenIdsForTraitId(BUCK_TEETH_TRAIT_ID))
    assert.equal(slot.includeIds.length, 11)
  })

  it('rejects hidden-trait includeIds that exceed the offer cap', () => {
    assert.throws(
      () => compileOfferSlot(data, { query: { text: 'hidden earring' } }),
      /query matches 376 punks; refine it to 64 or fewer ids/,
    )
  })

  it('materializes collection ids combined with compiled criteria', () => {
    const slot = compileOfferSlot(data, { query: { text: 'burned male' } })
    const search = data.searchSync({ text: 'burned male' })
    assert.deepEqual(slot.criteria, emptyPunksFilter())
    assert.deepEqual(slot.includeIds, search)
    assert.equal(search.length, 9)
  })

  it('rejects empty collection intersections instead of widening the offer', () => {
    assert.throws(
      () => compileOfferSlot(data, { query: { text: 'burned alien' } }),
      /matches no punks/,
    )
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

  it('compiles offchain synonyms as canonical trait constraints', () => {
    const covid = compileOfferSlot(data, { query: { text: 'covid punk' } })
    assert.equal(covid.criteria.requiredTraitMask, mask(MEDICAL_MASK_TRAIT_ID))

    const marilyn = compileOfferSlot(data, { query: { text: 'marilyn' } })
    assert.equal(
      marilyn.criteria.requiredTraitMask,
      mask(FEMALE_TRAIT_ID, BLONDE_BOB_TRAIT_ID, HOT_LIPSTICK_TRAIT_ID),
    )

    const mrT = compileOfferSlot(data, { query: { text: 'mr. t' } })
    assert.equal(
      mrT.criteria.requiredTraitMask,
      mask(MALE_TRAIT_ID, MOHAWK_TRAIT_ID, GOLD_CHAIN_TRAIT_ID),
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
