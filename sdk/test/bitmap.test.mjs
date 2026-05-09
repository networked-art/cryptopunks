import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bitmapToPunkIds,
  countPunkBitmap,
  fullPunkBitmap,
  intersectPunkBitmaps,
  PunksDataValidationError,
  punkBitmapFromIds,
  punkBitmapHasId,
  subtractPunkBitmaps,
  unionPunkBitmaps,
} from '../dist/index.js'

describe('bitmap utilities', () => {
  it('round-trips sparse punk ids and ignores invalid tail bits', () => {
    const bitmap = punkBitmapFromIds([0, 255, 256, 9999])

    assert.equal(punkBitmapHasId(bitmap, 0), true)
    assert.equal(punkBitmapHasId(bitmap, 9998), false)
    assert.deepEqual(bitmapToPunkIds(bitmap), [0, 255, 256, 9999])
    assert.equal(countPunkBitmap(bitmap), 4)

    bitmap[39] |= 1n << 200n
    assert.deepEqual(bitmapToPunkIds(bitmap), [0, 255, 256, 9999])
    assert.equal(countPunkBitmap(bitmap), 4)
  })

  it('combines bitmaps as set operations', () => {
    const a = punkBitmapFromIds([1, 2, 3, 9999])
    const b = punkBitmapFromIds([3, 4, 9999])

    assert.deepEqual(bitmapToPunkIds(unionPunkBitmaps([a, b])), [1, 2, 3, 4, 9999])
    assert.deepEqual(bitmapToPunkIds(intersectPunkBitmaps([a, b])), [3, 9999])
    assert.deepEqual(bitmapToPunkIds(subtractPunkBitmaps(a, b)), [1, 2])
  })

  it('paginates ids in ascending punk order', () => {
    const bitmap = fullPunkBitmap()
    assert.deepEqual(bitmapToPunkIds(bitmap, { offset: 9984, limit: 20 }), [
      9984, 9985, 9986, 9987, 9988, 9989, 9990, 9991, 9992, 9993,
      9994, 9995, 9996, 9997, 9998, 9999,
    ])
  })

  it('returns an empty page for a zero limit', () => {
    assert.deepEqual(bitmapToPunkIds(fullPunkBitmap(), { limit: 0 }), [])
  })

  it('rejects malformed external bitmap words', () => {
    assert.throws(() => countPunkBitmap([-1n]), PunksDataValidationError)
    assert.throws(() => countPunkBitmap([1n << 256n]), PunksDataValidationError)
    assert.throws(() => countPunkBitmap([1]), PunksDataValidationError)
    assert.throws(() => countPunkBitmap(null), PunksDataValidationError)
  })
})
