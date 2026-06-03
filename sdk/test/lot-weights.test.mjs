import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PUNKS_AUCTION_TOTAL_WEIGHT_BPS,
  createPunksSdk,
  splitPunksAuctionLotWeights,
  splitPunksAuctionLotWeightsByValue,
} from '../dist/index.js'

const TOTAL = PUNKS_AUCTION_TOTAL_WEIGHT_BPS

function assertValidLot(weights, count) {
  assert.equal(weights.length, count)
  assert.equal(
    weights.reduce((sum, weight) => sum + weight, 0),
    TOTAL,
  )
  for (const weight of weights) {
    assert.ok(Number.isInteger(weight) && weight >= 1, `weight ${weight} >= 1`)
  }
}

describe('splitPunksAuctionLotWeightsByValue', () => {
  it('returns no weights for an empty lot', () => {
    assert.deepEqual(splitPunksAuctionLotWeightsByValue([]), [])
  })

  it('gives the whole weight to a single item', () => {
    assert.deepEqual(splitPunksAuctionLotWeightsByValue([42n]), [TOTAL])
  })

  it('falls back to an even split when there is no signal', () => {
    assert.deepEqual(
      splitPunksAuctionLotWeightsByValue([0n, 0n, 0n]),
      splitPunksAuctionLotWeights(3),
    )
    // Negative magnitudes are floored to zero, so an all-negative lot is even.
    assert.deepEqual(
      splitPunksAuctionLotWeightsByValue([-5n, -1n]),
      splitPunksAuctionLotWeights(2),
    )
  })

  it('apportions proportionally and always sums to the total', () => {
    const weights = splitPunksAuctionLotWeightsByValue([1n, 3n])
    assertValidLot(weights, 2)
    // ~1:3 split, biased toward the larger value.
    assert.ok(weights[1] > weights[0] * 2)
  })

  it('keeps full bigint (wei-scale) precision', () => {
    const wei = 10n ** 20n
    const weights = splitPunksAuctionLotWeightsByValue([wei, 3n * wei])
    assertValidLot(weights, 2)
    // ~1:3 — a single basis point of the 9998-bp pool lands on the first item
    // by the remainder tie-break, so the exact ideal 2500:7500 reads 2501:7499.
    assert.deepEqual(weights, [2501, 7499])
  })

  it('floors every item at one basis point, even dust-valued ones', () => {
    const weights = splitPunksAuctionLotWeightsByValue([5n, 0n, 0n])
    assertValidLot(weights, 3)
    assert.deepEqual(weights, [9998, 1, 1])
  })

  it('handles a full-size, value-weighted lot', () => {
    const values = Array.from({ length: 80 }, (_v, index) => BigInt(index + 1))
    const weights = splitPunksAuctionLotWeightsByValue(values)
    assertValidLot(weights, 80)
    // Monotonic by construction for well-separated values.
    for (let i = 1; i < weights.length; i += 1) {
      assert.ok(weights[i] >= weights[i - 1])
    }
  })
})

describe('PunksAuctionClient.lotWeightsFromRarity', () => {
  const punks = createPunksSdk()

  // Independent re-derivation of the dataset's rarity magnitude, used to pin
  // the method to "rarity → value allocator".
  function rarityValues(ids) {
    const supply = new Float64Array(120)
    for (const trait of punks.dataset.traits()) supply[trait.id] = trait.supply
    return ids.map((id) => {
      let rarity = 0
      for (const traitId of punks.dataset.get(id).traitIds) {
        rarity += Math.log1p(10_000 / Math.max(1, supply[traitId] || 1))
      }
      return BigInt(Math.round(rarity * 1_000_000))
    })
  }

  it('gives a one-Punk lot the full weight', () => {
    assert.deepEqual(punks.auctions.lotWeightsFromRarity([1]), [TOTAL])
  })

  it('splits two identical Punks evenly', () => {
    assert.deepEqual(punks.auctions.lotWeightsFromRarity([1, 1]), [5000, 5000])
  })

  it('produces a valid lot for a mixed bundle', () => {
    const ids = [5822, 3100, 1, 42, 9999]
    assertValidLot(punks.auctions.lotWeightsFromRarity(ids), ids.length)
  })

  it('matches the value allocator fed the dataset rarity', () => {
    const ids = [5822, 3100, 1, 42, 9999]
    assert.deepEqual(
      punks.auctions.lotWeightsFromRarity(ids),
      splitPunksAuctionLotWeightsByValue(rarityValues(ids)),
    )
  })

  it('gives the rarest Punk the largest share (alien #5822 over commons)', () => {
    const ids = [1, 42, 5822]
    const weights = punks.auctions.lotWeightsFromRarity(ids)
    assert.equal(weights.indexOf(Math.max(...weights)), 2)
  })
})
