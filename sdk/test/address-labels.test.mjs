import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addressLabel,
  addressForLabel,
  searchCollections,
} from '../dist/index.js'

describe('addressLabel', () => {
  it('labels known addresses with a short and full name', () => {
    assert.deepEqual(addressLabel('0x0c5Ca6bE6fF0Cd69F4fF9e29df639a0806aea91E'), {
      short: 'NODE',
      name: 'NODE FOUNDATION',
    })
    assert.deepEqual(addressLabel('0xa858ddc0445d8131dac4d1de01f834ffcba52ef1'), {
      short: 'YUGA',
      name: 'YUGALABS',
    })
  })

  it('matches regardless of address checksum casing', () => {
    const lower = addressLabel('0x0c5ca6be6ff0cd69f4ff9e29df639a0806aea91e')
    const upper = addressLabel('0x0C5CA6BE6FF0CD69F4FF9E29DF639A0806AEA91E')
    assert.deepEqual(lower, { short: 'NODE', name: 'NODE FOUNDATION' })
    assert.deepEqual(lower, upper)
  })

  it('returns undefined for unknown or empty input', () => {
    assert.equal(
      addressLabel('0x000000000000000000000000000000000000dEaD'),
      undefined,
    )
    assert.equal(addressLabel(''), undefined)
    assert.equal(addressLabel(undefined), undefined)
    assert.equal(addressLabel(null), undefined)
  })

  it('derives labels from curated-collection institutions that declare an address', () => {
    const institutions = searchCollections.flatMap(
      (collection) => collection.institutions ?? [],
    )
    const withAddress = institutions.filter(
      (institution) => institution.address !== undefined,
    )
    for (const institution of withAddress) {
      assert.deepEqual(addressLabel(institution.address), {
        short: institution.short ?? institution.slug.toUpperCase(),
        name: institution.title,
      })
      // Case-insensitive, like the hand-curated entries.
      assert.deepEqual(
        addressLabel(institution.address.toLowerCase()),
        addressLabel(institution.address.toUpperCase()),
      )
    }
  })
})

describe('addressForLabel', () => {
  const NODE = '0x0c5Ca6bE6fF0Cd69F4fF9e29df639a0806aea91E'
  const YUGA = '0xa858ddc0445d8131dac4d1de01f834ffcba52ef1'

  const lower = (address) => address.toLowerCase()

  it('resolves either the short or the full label form to an address', () => {
    assert.equal(lower(addressForLabel('NODE')), lower(NODE))
    assert.equal(lower(addressForLabel('NODE FOUNDATION')), lower(NODE))
    assert.equal(lower(addressForLabel('YUGA')), lower(YUGA))
    assert.equal(lower(addressForLabel('YUGALABS')), lower(YUGA))
  })

  it('matches case- and punctuation-insensitively', () => {
    assert.equal(lower(addressForLabel('node')), lower(NODE))
    assert.equal(lower(addressForLabel('  node   foundation  ')), lower(NODE))
  })

  it('round-trips with addressLabel for every labeled address', () => {
    const institutions = searchCollections.flatMap(
      (collection) => collection.institutions ?? [],
    )
    for (const institution of institutions) {
      if (institution.address === undefined) continue
      const label = addressLabel(institution.address)
      assert.equal(
        lower(addressForLabel(label.short)),
        lower(institution.address),
      )
      assert.equal(
        lower(addressForLabel(label.name)),
        lower(institution.address),
      )
    }
  })

  it('returns undefined for unknown or empty input', () => {
    assert.equal(addressForLabel('not a label'), undefined)
    assert.equal(addressForLabel(''), undefined)
    assert.equal(addressForLabel(undefined), undefined)
    assert.equal(addressForLabel(null), undefined)
  })
})
