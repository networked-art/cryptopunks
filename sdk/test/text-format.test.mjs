import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compileOfferSlot,
  compilePunksFilter,
  emptyPunksFilter,
  formatSearchText,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const data = createOfflinePunksDataClient()
const BEANIE_TRAIT_ID = data.resolveTraitSync('Beanie').id

/// Mirrors punksmarket.app/PunkSearch.vue — hex color tokens in the URL are stripped
/// out of `text` and routed into `colors.required` before the search runs.
/// The bid card's link is consumed by that page, so the round-trip must
/// honour the same preprocessing.
const HEX_COLOR_TOKEN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g

function searchTextToQuery(raw) {
  const colors = raw.match(HEX_COLOR_TOKEN)
  const remaining = raw
    .replace(HEX_COLOR_TOKEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    text: remaining || undefined,
    colors: colors?.length ? { required: colors } : undefined,
  }
}

function bidToQuery(bid) {
  const c = bid.criteria ?? emptyPunksFilter()
  const query = {}
  if (
    c.requiredTraitMask !== 0n ||
    c.forbiddenTraitMask !== 0n ||
    c.anyOfTraitMask !== 0n
  ) {
    query.attributes = {
      requiredMask: c.requiredTraitMask,
      forbiddenMask: c.forbiddenTraitMask,
      anyOfMask: c.anyOfTraitMask,
    }
  }
  if (
    c.requiredColorMask !== 0n ||
    c.forbiddenColorMask !== 0n ||
    c.anyOfColorMask !== 0n
  ) {
    query.colors = {
      requiredMask: c.requiredColorMask,
      forbiddenMask: c.forbiddenColorMask,
      anyOfMask: c.anyOfColorMask,
    }
  }
  if (c.maxPixelCount > 0) {
    query.pixelCount = { min: c.minPixelCount, max: c.maxPixelCount }
  }
  if (c.maxColorCount > 0) {
    query.colorCount = { min: c.minColorCount, max: c.maxColorCount }
  }
  if (bid.includeIds?.length) query.ids = bid.includeIds
  if (bid.excludeIds?.length) query.excludeIds = bid.excludeIds
  return query
}

/// The matching set the bid will accept (what the bid card's count shows)
/// must equal the matching set produced by feeding the formatted text back
/// through PunkSearch's URL parser. Anything else and the link drops the
/// user on a different result set than the badge advertised.
function assertMatchesRoundTrip(bid) {
  const text = formatSearchText(data, bid)
  const fromBid = data.searchSync(bidToQuery(bid))
  const fromText = data.searchSync(searchTextToQuery(text))
  assert.deepEqual(
    fromText,
    fromBid,
    `mismatch for text: ${JSON.stringify(text)}`,
  )
  assert.ok(fromBid.length > 0, 'expected the bid to match at least one punk')
}

describe('formatSearchText — round-trips matching sets', () => {
  it('handles a simple required-trait query', () => {
    const slot = compileOfferSlot(data, { query: { text: 'stringy' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles a normalized-type required trait', () => {
    const slot = compileOfferSlot(data, { query: { text: 'male' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles skin-tone any-of via the albino shorthand', () => {
    const slot = compileOfferSlot(data, { query: { text: 'albino' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles skin-tone any-of via the `<tone> skin` form', () => {
    const slot = compileOfferSlot(data, { query: { text: 'dark skin' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles required + skin-tone any-of together', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'stringy male albino' },
    })
    assertMatchesRoundTrip(slot)
  })

  it('handles a single attribute-count constraint', () => {
    const slot = compileOfferSlot(data, { query: { text: '3 attributes' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles an attribute-count range any-of group', () => {
    const slot = compileOfferSlot(data, {
      query: { text: '2-4 attributes' },
    })
    assertMatchesRoundTrip(slot)
  })

  it('handles a generic trait any-of group', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'Beanie or Hoodie' },
    })
    assert.equal(
      formatSearchText(data, { criteria: slot.criteria }),
      '"Beanie" OR "Hoodie"',
    )
    assertMatchesRoundTrip(slot)
  })

  it('handles an arbitrary trait any-of mask as quoted OR terms', () => {
    /// Trait id 0 (NormalizedType.Alien) + Beanie cross
    /// recognized buckets, so the formatter falls back to an explicit OR list.
    const bid = {
      includeIds: [],
      excludeIds: [],
      criteria: {
        ...emptyPunksFilter(),
        anyOfTraitMask: (1n << 0n) | (1n << BigInt(BEANIE_TRAIT_ID)),
      },
    }
    assert.equal(formatSearchText(data, bid), '"Alien" OR "Beanie"')
    assertMatchesRoundTrip(bid)
  })

  it('handles a color-count constraint', () => {
    const slot = compileOfferSlot(data, { query: { text: '4 colors' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles a color-count range', () => {
    const slot = compileOfferSlot(data, { query: { text: '3-5 colors' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles a pixel-count single value', () => {
    const slot = compileOfferSlot(data, { query: { text: '200 pixels' } })
    assertMatchesRoundTrip(slot)
  })

  it('handles a one-sided pixel-count comparator', () => {
    const slot = compileOfferSlot(data, {
      query: { text: '<=200 pixels' },
    })
    assertMatchesRoundTrip(slot)
  })

  it('handles a required color from a palette hex', () => {
    /// `0x0040ffff` is a niche blue with 272 matching punks — small enough
    /// to be a meaningful filter, large enough to verify the round-trip.
    const slot = compileOfferSlot(data, {
      query: { colors: { required: ['0x0040ffff'] } },
    })
    assertMatchesRoundTrip(slot)
  })

  it('handles an empty-criteria bid with includeIds (the offline fallback case)', () => {
    const bid = {
      criteria: emptyPunksFilter(),
      includeIds: [1001, 3, 42],
      excludeIds: [],
    }
    const text = formatSearchText(data, bid)
    assert.equal(text, '#1001 #3 #42')
    assertMatchesRoundTrip(bid)
  })

  it('honours excludeIds', () => {
    const slot = compileOfferSlot(data, {
      query: { text: 'stringy' },
      excludeIds: [data.searchSync({ text: 'stringy' })[0]],
    })
    assertMatchesRoundTrip(slot)
  })
})

describe('formatSearchText — rejects unrepresentable filters', () => {
  it('throws when the filter has a forbidden trait mask', () => {
    const filter = compilePunksFilter(data, { text: 'stringy' })
    const broken = { ...filter, forbiddenTraitMask: 1n }
    assert.throws(
      () => formatSearchText(data, { criteria: broken }),
      /forbidden trait masks/,
    )
  })

  it('throws when the filter has a forbidden color mask', () => {
    const broken = { ...emptyPunksFilter(), forbiddenColorMask: 1n }
    assert.throws(
      () => formatSearchText(data, { criteria: broken }),
      /forbidden color masks/,
    )
  })

  it('throws when the filter has an any-of color mask', () => {
    const broken = { ...emptyPunksFilter(), anyOfColorMask: 1n }
    assert.throws(
      () => formatSearchText(data, { criteria: broken }),
      /any-of color masks/,
    )
  })

  it('throws when a generic any-of trait mask needs grouping', () => {
    const slot = compileOfferSlot(data, {
      query: {
        attributes: {
          required: ['Male'],
          anyOf: ['Beanie', 'Hoodie'],
        },
      },
    })
    assert.throws(
      () => formatSearchText(data, { criteria: slot.criteria }),
      /generic any-of trait masks/,
    )
    assert.throws(
      () =>
        formatSearchText(data, {
          criteria: {
            ...emptyPunksFilter(),
            anyOfTraitMask:
              (1n << BigInt(BEANIE_TRAIT_ID)) |
              (1n << BigInt(data.resolveTraitSync('Hoodie').id)),
          },
          excludeIds: [1],
        }),
      /generic any-of trait masks/,
    )
  })
})
