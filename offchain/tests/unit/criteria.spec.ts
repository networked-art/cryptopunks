import { test } from '@japa/runner'
import { parseCriteria, criteriaMatchesPunk } from '#services/criteria'
import { HttpError } from '#exceptions/http_error'

test.group('criteria service', () => {
  test('accepts a valid PunkQuery', ({ assert }) => {
    const parsed = parseCriteria({ type: 'alien' })
    assert.deepEqual(parsed, { type: 'alien' })
  })

  test('rejects garbage input', ({ assert }) => {
    assert.throws(() => parseCriteria({ type: 'not-a-real-type' }), HttpError)
  })

  test('rejects non-object input', ({ assert }) => {
    assert.throws(() => parseCriteria('alien'), HttpError)
    assert.throws(() => parseCriteria([]), HttpError)
  })

  test('matches an actual alien punk', ({ assert }) => {
    // CryptoPunk #635 is an Alien
    assert.isTrue(criteriaMatchesPunk({ type: 'alien' }, 635))
    assert.isFalse(criteriaMatchesPunk({ type: 'alien' }, 1))
  })
})
