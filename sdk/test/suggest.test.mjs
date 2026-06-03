import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activeSearchToken,
  createPunksDataset,
  suggestSearchText,
} from '../dist/index.js'
import { createOfflinePunksDataClient } from '../dist/offline.js'

const dataset = createPunksDataset()
const client = createOfflinePunksDataClient()
const suggest = (text, options) => dataset.suggest(text, options)
const labels = (text) => suggest(text).map((s) => s.label)
const kinds = (text) => new Set(suggest(text).map((s) => s.kind))
const find = (text, label) => suggest(text).find((s) => s.label === label)

describe('activeSearchToken', () => {
  it('splits the trailing word from the rest', () => {
    assert.deepEqual(activeSearchToken('male hoo'), {
      active: 'hoo',
      preceding: 'male ',
    })
  })

  it('returns undefined when there is nothing to complete', () => {
    assert.equal(activeSearchToken(''), undefined)
    assert.equal(activeSearchToken('hoodie '), undefined) // finished word
    assert.equal(activeSearchToken('"big sha'), undefined) // open quote
  })
})

describe('suggestSearchText', () => {
  it('returns nothing without an active word', () => {
    assert.deepEqual(suggest(''), [])
    assert.deepEqual(suggest('hoodie '), [])
    assert.deepEqual(suggest('1234'), []) // a bare id is not a vocabulary term
    assert.deepEqual(suggest('vault.eth'), [])
  })

  it('completes a trait to its exact, quoted name with its supply', () => {
    const hoodie = find('hoo', 'Hoodie')
    assert.ok(hoodie)
    assert.equal(hoodie.kind, 'trait')
    assert.equal(hoodie.query, '"Hoodie"')
    assert.equal(hoodie.count, client.resolveTraitSync('Hoodie').supply)
  })

  it('keeps the preceding terms when completing a trait', () => {
    assert.equal(find('male hoo', 'Hoodie').query, 'male "Hoodie"')
  })

  it('absorbs a preceding word that belongs to the trait name', () => {
    // `big sh` is Big Shades — `big` folds in rather than dangling, and the
    // other `sh` traits (Regular Shades, …) drop out.
    assert.deepEqual(labels('big sh'), ['Big Shades'])
    assert.equal(find('big sh', 'Big Shades').query, '"Big Shades"')
    assert.deepEqual(labels('3d gl'), ['3D Glasses'])
  })

  it('ranks trait matches by supply and caps the group', () => {
    const capped = suggest('a', { traitLimit: 3 })
    assert.ok(capped.length <= 3)
    const supplies = suggest('sha').map((s) => s.count)
    assert.deepEqual(
      supplies,
      [...supplies].sort((a, b) => b - a),
    )
  })

  it('drops HeadVariant / AttributeCount names (no duplicate Zombie)', () => {
    assert.deepEqual(labels('zo'), ['Zombie'])
  })

  it('completes a curated collection alias with its size', () => {
    const burned = find('bur', 'Burned Punks')
    assert.ok(burned)
    assert.equal(burned.kind, 'collection')
    assert.equal(burned.query, 'burned')
    assert.equal(burned.count, client.searchSync({ text: 'burned' }).length)
  })

  it('needs at least two letters before matching a collection', () => {
    assert.ok(!kinds('m').has('collection'))
    assert.ok(kinds('mo').has('collection'))
  })

  it('completes skin tones', () => {
    assert.equal(find('alb', 'Albino').query, 'albino')
    assert.equal(find('dar', 'Dark skin').query, 'dark skin')
    assert.ok(suggest('a').every((s) => s.kind !== 'skin-tone')) // one letter is too thin
  })

  it('matches suggestions anywhere in the result text', () => {
    const skinLabels = labels('skin')
    assert.ok(skinLabels.includes('Dark skin'))
    assert.ok(skinLabels.includes('Brown skin'))
    assert.ok(skinLabels.includes('Fair skin'))
    assert.equal(find('air', 'Wild Hair').query, '"Wild Hair"')
    assert.equal(
      find('modern', 'Museum of Modern Art (MoMA)').query,
      'museum of modern art',
    )
    assert.equal(find('2 lors', '2 colors').query, '2 colors')
  })

  it('absorbs a leading skin-tone grammar word instead of duplicating it', () => {
    // `skin da` / `tone da` already say "skin"; completing must not yield
    // `skin dark skin`.
    assert.equal(find('skin da', 'Dark skin').query, 'dark skin')
    assert.equal(find('tone da', 'Dark skin').query, 'dark skin')
    assert.equal(find('skintone bro', 'Brown skin').query, 'brown skin')
    assert.equal(find('skin alb', 'Albino').query, 'albino')
    // An unrelated preceding word is still kept.
    assert.equal(find('male da', 'Dark skin').query, 'male dark skin')
  })

  it('completes a count axis after a number', () => {
    const colors = find('2 c', '2 colors')
    assert.ok(colors)
    assert.equal(colors.kind, 'count')
    assert.equal(colors.query, '2 colors')
    assert.equal(find('male 3 attr', '3 attributes').query, 'male 3 attributes')
  })

  it('surfaces a collection ahead of trait matches', () => {
    const list = suggest('mo')
    assert.equal(list[0].label, 'Museum of Modern Art (MoMA)')
    assert.ok(list.some((s) => s.kind === 'trait'))
  })

  it('round-trips: applying a suggestion yields a working query', () => {
    for (const text of [
      'sha',
      'big sh',
      'bur',
      'male hoo',
      '2 c',
      'skin',
      'air',
      'modern',
      '2 lors',
    ]) {
      for (const suggestion of suggest(text)) {
        assert.doesNotThrow(() => client.searchSync({ text: suggestion.query }))
      }
    }
  })
})
