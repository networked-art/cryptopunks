import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createOfflinePunksDataClient } from '../dist/offline.js'
import { bundledOfflinePunksDataWithPixels } from '../dist/offline-pixel-data.js'
import { createPunksSimilarity } from '../dist/similarity.js'

const similarity = createPunksSimilarity()
const data = createOfflinePunksDataClient()

describe('PunkSimilarityIndex', () => {
  it('scores pairs deterministically, symmetrically, and within bounds', () => {
    for (const [a, b] of [
      [0, 1],
      [8348, 7804],
      [8348, 7861],
      [2890, 3100],
    ]) {
      const ab = similarity.score(a, b)
      const ba = similarity.score(b, a)
      assert.equal(ab, similarity.score(a, b))
      assert.equal(ab, ba)
      assert.ok(ab >= 0 && ab <= 1)
    }

    assert.equal(similarity.score(8348, 8348), 1)
  })

  it('keeps self matches opt-in for similar()', () => {
    assert.notEqual(similarity.similar(8348, { limit: 1 })[0].punkId, 8348)

    const [self] = similarity.similar(8348, {
      includeSelf: true,
      limit: 1,
    })
    assert.equal(self.punkId, 8348)
    assert.equal(self.score, 1)
  })

  it('applies filters, limits, minScore, and explicit exclusions', () => {
    const zombies = similarity.similar(8348, {
      filter: { type: 'Zombie' },
      limit: 8,
    })
    assert.equal(zombies.length, 8)
    for (const result of zombies) {
      assert.equal(data.getPunkSync(result.punkId).punkTypeName, 'Zombie')
    }

    const top = similarity.similar(8348, { limit: 3 })
    assert.equal(top.length, 3)
    const withoutTop = similarity.similar(8348, {
      limit: 3,
      excludeIds: [top[0].punkId],
    })
    assert.notEqual(withoutTop[0].punkId, top[0].punkId)

    assert.deepEqual(
      similarity
        .similar(8348, {
          includeSelf: true,
          minScore: 1,
          limit: 3,
        })
        .map((result) => result.punkId),
      [8348],
    )
  })

  it('returns structured explanations with shared accessories and colors', () => {
    const explanation = similarity.explain(8348, 7861)

    assert.equal(explanation.punkId, 8348)
    assert.equal(explanation.otherPunkId, 7861)
    assert.ok(explanation.score > 0)
    assert.deepEqual(
      explanation.accessories.shared.map((trait) => trait.name),
      ['Big Beard', 'Cigarette', 'Earring'],
    )
    assert.ok(
      explanation.accessories.onlyA.some((trait) => trait.name === 'Top Hat'),
    )
    assert.ok(explanation.colors.shared.some((color) => color.id === 1))
    const scalarAverage =
      (explanation.scalars.pixelCount.score +
        explanation.scalars.colorCount.score +
        explanation.scalars.attributeCount.score) /
      3
    assert.ok(Math.abs(explanation.components.scalars - scalarAverage) < 1e-12)
  })

  it('changes score weighting by profile', () => {
    const balanced = similarity.score(8348, 7804)
    const colors = similarity.score(8348, 7804, { profile: 'colors' })
    const traits = similarity.score(8348, 7804, { profile: 'traits' })

    assert.notEqual(balanced, colors)
    assert.notEqual(colors, traits)
  })

  it('handles visual scoring without pixel data and uses pixels when supplied', () => {
    const withoutPixels = similarity.explain(8348, 7804, { profile: 'visual' })
    assert.equal(withoutPixels.pixelsAvailable, false)
    assert.equal(withoutPixels.components.pixels, undefined)
    assert.ok(withoutPixels.score >= 0 && withoutPixels.score <= 1)

    const withPixels = createPunksSimilarity({
      dataset: bundledOfflinePunksDataWithPixels,
    }).explain(8348, 7804, { profile: 'visual' })
    assert.equal(withPixels.pixelsAvailable, true)
    assert.equal(typeof withPixels.components.pixels, 'number')
    assert.ok(
      withPixels.components.pixels >= 0 && withPixels.components.pixels <= 1,
    )
  })

  it('recommends from liked and disliked examples with deterministic ties', () => {
    const first = similarity.recommend({
      liked: [8348, 7804],
      disliked: [1234],
      limit: 5,
    })
    const second = similarity.recommend({
      liked: [8348, 7804],
      disliked: [1234],
      limit: 5,
    })

    assert.equal(first.length, 5)
    assert.deepEqual(first, second)
    assert.ok(!first.some((result) => result.punkId === 8348))
    assert.ok(!first.some((result) => result.punkId === 7804))
    assert.ok(!first.some((result) => result.punkId === 1234))

    const diversified = similarity.recommend({
      liked: [8348, 7804],
      limit: 5,
      diversify: true,
    })
    assert.equal(diversified.length, 5)
  })
})
