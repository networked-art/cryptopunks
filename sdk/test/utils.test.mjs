import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PunksDataValidationError,
  hexToBytes,
  idsFromMask,
  normalizeRgbaHex,
  validateColorMask,
  validateTraitMask,
} from '../dist/index.js'

describe('utility validation', () => {
  it('rejects malformed hex instead of silently decoding zero bytes', () => {
    assert.throws(() => hexToBytes('0xzz'), PunksDataValidationError)
    assert.throws(() => hexToBytes('0xabc'), PunksDataValidationError)
  })

  it('normalizes common color formats', () => {
    assert.equal(normalizeRgbaHex('#111111'), '0x111111ff')
    assert.equal(normalizeRgbaHex('0x11111180'), '0x11111180')
  })

  it('returns typed validation errors for invalid mask inputs', () => {
    assert.throws(() => validateTraitMask(1), PunksDataValidationError)
    assert.throws(() => validateColorMask(1), PunksDataValidationError)
    assert.throws(() => idsFromMask(1, 10), PunksDataValidationError)
  })
})
