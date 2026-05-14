// Canonical punks.png renderer — pure, deterministic, dependency-free.
//
// Given the on-chain pixel data (10,000 punks of 576 indexed bytes each + a
// 256-color RGBA palette), this module emits the exact byte stream of the
// canonical `punks.png` — sha256 ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b.
//
// The encoder is a JavaScript port of the Solidity DEFLATE pipeline under
// contracts/contracts/lib/{Zlib*,Adler32,Crc32,PngEncoder}.sol, which itself
// mirrors Python's `zlib.compress(scanlines, 9)`. Browser and Node host zlibs
// (Chromium fork) do not reproduce upstream zlib byte-for-byte, so a custom
// port is the only portable way to hit the canonical hash.
//
// This file is intended to also serve as the canonical on-chain artifact:
// pure ES, no imports, no host APIs beyond standard typed arrays.

// ============================================================================
// Constants
// ============================================================================

const PUNK_COUNT = 10_000
const PUNK_SIZE = 24
const PUNK_PIXELS = PUNK_SIZE * PUNK_SIZE // 576
const GRID_SIZE = 100
const MOSAIC_SIZE = GRID_SIZE * PUNK_SIZE // 2400
const RGBA = 4
const SCANLINE_BYTES = 1 + MOSAIC_SIZE * RGBA // 9601
const INFLATED_SCANLINE_BYTES = MOSAIC_SIZE * SCANLINE_BYTES // 23_042_400
const IDAT_CHUNK_PAYLOAD_BYTES = 32_768

// LZ77 (mirrors ZlibSlow.sol)
const MIN_MATCH = 3
const MAX_MATCH = 258
const MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1
const MAX_DIST = 32_768 - MIN_LOOKAHEAD
const TOO_FAR = 4_096
const HASH_SIZE = 32_768
const HASH_MASK = HASH_SIZE - 1
const HASH_SHIFT = 5
const GOOD_MATCH = 32
const MAX_LAZY_MATCH = 258
const NICE_MATCH = 258
const MAX_CHAIN_LENGTH = 4_096

// Dynamic block (mirrors ZlibDynamicBlock.sol)
const L_CODES = 286
const D_CODES = 30
const BL_CODES = 19
const END_BLOCK = 256
const MAX_BITS = 15
const MAX_BL_BITS = 7
const REP_3_6 = 16
const REPZ_3_10 = 17
const REPZ_11_138 = 18

// Canonical block partition (matches PunksPng.sol DEFLATE_BLOCK_COUNT etc.)
const DEFLATE_BLOCK_COUNT = 23
const FULL_DEFLATE_BLOCK_TOKENS = 16_383
const FINAL_DEFLATE_BLOCK_TOKENS = 3_537

const CODE_LENGTH_ORDER = Object.freeze([
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
])

// ============================================================================
// Adler-32 (RFC 1950)
// ============================================================================

function adler32(data, offset = 0, length = data.length - offset) {
  const BASE = 65521
  const NMAX = 5552
  let a = 1
  let b = 0
  let i = offset
  const end = offset + length
  while (i < end) {
    let limit = i + NMAX
    if (limit > end) limit = end
    while (i < limit) {
      a += data[i++]
      b += a
    }
    a %= BASE
    b %= BASE
  }
  return ((b << 16) | a) >>> 0
}

// ============================================================================
// CRC32 (IEEE 802.3, poly 0xEDB88320) — table built once on first use.
// ============================================================================

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(data, offset = 0, length = data.length - offset) {
  let crc = 0xFFFFFFFF
  const end = offset + length
  for (let i = offset; i < end; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ============================================================================
// BitWriter — LSB-first, growable. Replaces ZlibBitWriter.sol.
// ============================================================================

class BitWriter {
  constructor(initialBytes = 1 << 20) {
    this.buf = new Uint8Array(initialBytes)
    this.byteIndex = 0
    this.acc = 0 >>> 0
    this.accBits = 0
  }

  _grow(needBytes) {
    if (this.byteIndex + needBytes <= this.buf.length) return
    let next = this.buf.length * 2
    while (next < this.byteIndex + needBytes) next *= 2
    const grown = new Uint8Array(next)
    grown.set(this.buf.subarray(0, this.byteIndex))
    this.buf = grown
  }

  // value < 2^bitCount, bitCount in [0..16]. JS bitops are 32-bit so the
  // accumulator can safely hold up to 24 bits before we flush.
  writeBits(value, bitCount) {
    if (bitCount === 0) return
    this.acc = (this.acc | ((value & ((1 << bitCount) - 1)) << this.accBits)) >>> 0
    this.accBits += bitCount
    while (this.accBits >= 8) {
      this._grow(1)
      this.buf[this.byteIndex++] = this.acc & 0xFF
      this.acc = this.acc >>> 8
      this.accBits -= 8
    }
  }

  flushPartialByte() {
    if (this.accBits > 0) {
      this._grow(1)
      this.buf[this.byteIndex++] = this.acc & 0xFF
      this.acc = 0
      this.accBits = 0
    }
  }

  result() {
    this.flushPartialByte()
    return this.buf.subarray(0, this.byteIndex)
  }
}

// ============================================================================
// Length / distance symbol tables (mirrors ZlibSymbols.sol)
// Precomputed for the full domain: lengths 3..258, distances 1..32768.
// ============================================================================

const LENGTH_SYMBOL = new Uint16Array(259)
const LENGTH_EXTRA_BITS = new Uint8Array(259)
const LENGTH_EXTRA_VALUE = new Uint16Array(259)

;(() => {
  for (let length = 3; length <= 258; length++) {
    let symbol, extraBits, extraValue
    if (length === 258) {
      symbol = 285; extraBits = 0; extraValue = 0
    } else {
      const n = length - 3
      if (n < 8) {
        symbol = 257 + n; extraBits = 0; extraValue = 0
      } else {
        let base = 11
        let sym = 265
        let eb = 0
        let ev = 0
        let assigned = false
        for (let bits = 1; bits <= 5; bits++) {
          const span = 1 << bits
          const groupSize = span * 4
          if (length < base + groupSize) {
            const index = ((length - base) / span) | 0
            sym += index
            eb = bits
            ev = length - (base + index * span)
            assigned = true
            break
          }
          base += groupSize
          sym += 4
        }
        if (!assigned) throw new Error('length symbol overflow')
        symbol = sym; extraBits = eb; extraValue = ev
      }
    }
    LENGTH_SYMBOL[length] = symbol
    LENGTH_EXTRA_BITS[length] = extraBits
    LENGTH_EXTRA_VALUE[length] = extraValue
  }
})()

// Distances: 1..32768. To avoid a 32K table we compute on demand.
function distanceSymbol(distance) {
  if (distance <= 4) {
    return { symbol: distance - 1, extraBits: 0, extraValue: 0 }
  }
  let base = 5
  let sym = 4
  for (let bits = 1; bits <= 13; bits++) {
    const span = 1 << bits
    const groupSize = span * 2
    if (distance < base + groupSize) {
      const index = ((distance - base) / span) | 0
      return {
        symbol: sym + index,
        extraBits: bits,
        extraValue: distance - (base + index * span),
      }
    }
    base += groupSize
    sym += 2
  }
  throw new Error(`invalid distance ${distance}`)
}

// ============================================================================
// Huffman tree builder (mirrors ZlibTrees.sol).
//
// Builds canonical bit lengths from a frequency array via the heap algorithm,
// then produces the bit-reversed canonical codes used by DEFLATE.
// ============================================================================

function buildBitLengths(frequencies, elementCount, maxLength) {
  const heapCapacity = elementCount * 2 + 1
  const freq = new Uint32Array(heapCapacity)
  const dad = new Uint16Array(heapCapacity)
  const len = new Uint8Array(heapCapacity)
  const heap = new Uint16Array(heapCapacity)
  const depth = new Uint8Array(heapCapacity)
  const bitLengthCounts = new Uint16Array(16)

  let signedMaxCode = -1
  let heapLength = 0

  for (let n = 0; n < elementCount; n++) {
    const f = frequencies[n]
    freq[n] = f
    if (f !== 0) {
      heap[++heapLength] = n
      signedMaxCode = n
    }
  }

  // Special case: fewer than 2 used codes — pad with synthetic entries so the
  // heap reduce step has something to work with.
  while (heapLength < 2) {
    const node = signedMaxCode < 2 ? ++signedMaxCode : 0
    heap[++heapLength] = node
    freq[node] = 1
  }

  const smaller = (a, b) => {
    if (freq[a] !== freq[b]) return freq[a] < freq[b]
    return depth[a] <= depth[b]
  }

  const pqdownheap = (start, heapLen) => {
    const value = heap[start]
    let k = start
    let j = k << 1
    while (j <= heapLen) {
      if (j < heapLen && smaller(heap[j + 1], heap[j])) j++
      if (smaller(value, heap[j])) break
      heap[k] = heap[j]
      k = j
      j <<= 1
    }
    heap[k] = value
  }

  for (let n = heapLength >> 1; n >= 1; n--) pqdownheap(n, heapLength)

  let heapMax = heapCapacity
  let nextNode = elementCount
  do {
    const first = heap[1]
    heap[1] = heap[heapLength--]
    pqdownheap(1, heapLength)

    const second = heap[1]
    heap[--heapMax] = first
    heap[--heapMax] = second

    freq[nextNode] = freq[first] + freq[second]
    depth[nextNode] = Math.max(depth[first], depth[second]) + 1
    dad[first] = nextNode
    dad[second] = nextNode
    heap[1] = nextNode++
    pqdownheap(1, heapLength)
  } while (heapLength >= 2)

  heap[--heapMax] = heap[1]
  const maxCode = signedMaxCode

  // Generate bit lengths walking the heap in reverse build order.
  let overflow = 0
  len[heap[heapMax]] = 0
  for (let h = heapMax + 1; h < heapCapacity; h++) {
    const n = heap[h]
    let bits = len[dad[n]] + 1
    if (bits > maxLength) { bits = maxLength; overflow++ }
    len[n] = bits
    if (n > maxCode) continue
    bitLengthCounts[bits]++
  }

  if (overflow !== 0) {
    do {
      let bits = maxLength - 1
      while (bitLengthCounts[bits] === 0) bits--
      bitLengthCounts[bits]--
      bitLengthCounts[bits + 1] += 2
      bitLengthCounts[maxLength]--
      overflow -= 2
    } while (overflow > 0)

    let h = heapCapacity
    for (let bits = maxLength; bits !== 0; bits--) {
      let count = bitLengthCounts[bits]
      while (count !== 0) {
        const m = heap[--h]
        if (m > maxCode) continue
        len[m] = bits
        count--
      }
    }
  }

  const lengths = new Uint8Array(maxCode + 1)
  for (let i = 0; i <= maxCode; i++) lengths[i] = len[i]
  return { lengths, maxCode }
}

function reverseBits(code, length) {
  let result = 0
  for (let i = 0; i < length; i++) {
    result = (result << 1) | (code & 1)
    code >>>= 1
  }
  return result
}

function buildCanonicalCodes(lengths, maxCode) {
  const bitLengthCounts = new Uint16Array(16)
  for (let i = 0; i <= maxCode; i++) {
    const l = lengths[i]
    if (l > 15) throw new Error('code length > 15')
    if (l !== 0) bitLengthCounts[l]++
  }
  const nextCode = new Uint16Array(16)
  let code = 0
  for (let bits = 1; bits <= 15; bits++) {
    code = (code + bitLengthCounts[bits - 1]) << 1
    nextCode[bits] = code
  }
  const codes = new Uint16Array(maxCode + 1)
  for (let symbol = 0; symbol <= maxCode; symbol++) {
    const l = lengths[symbol]
    if (l !== 0) {
      codes[symbol] = reverseBits(nextCode[l]++, l)
    }
  }
  return codes
}

// scanTree / encodeTree share the same control flow; they walk the bit-length
// sequence in zlib's run-length-with-repeats encoding. scanTree updates a
// frequency vector for the BL alphabet, encodeTree emits the actual symbol
// stream that goes into the block header.

function scanTree(bitLengthFreqs, lengths, maxCode) {
  let previousLength = 0xffff
  let nextLength = lengths[0]
  let count = 0
  let maxCount = 7
  let minCount = 4
  if (nextLength === 0) { maxCount = 138; minCount = 3 }

  for (let n = 0; n <= maxCode; n++) {
    const currentLength = nextLength
    nextLength = n === maxCode ? 0xffff : lengths[n + 1]
    if (++count < maxCount && currentLength === nextLength) {
      continue
    } else if (count < minCount) {
      bitLengthFreqs[currentLength] += count
    } else if (currentLength !== 0) {
      if (previousLength !== currentLength) bitLengthFreqs[currentLength]++
      bitLengthFreqs[REP_3_6]++
    } else if (count <= 10) {
      bitLengthFreqs[REPZ_3_10]++
    } else {
      bitLengthFreqs[REPZ_11_138]++
    }
    count = 0
    previousLength = currentLength
    if (nextLength === 0) { maxCount = 138; minCount = 3 }
    else if (currentLength === nextLength) { maxCount = 6; minCount = 3 }
    else { maxCount = 7; minCount = 4 }
  }
}

function encodeTree(lengths, maxCode) {
  const symbols = []
  const extraBits = []
  const extraValues = []

  let previousLength = 0xffff
  let nextLength = lengths[0]
  let count = 0
  let maxCount = 7
  let minCount = 4
  if (nextLength === 0) { maxCount = 138; minCount = 3 }

  for (let n = 0; n <= maxCode; n++) {
    const currentLength = nextLength
    nextLength = n === maxCode ? 0xffff : lengths[n + 1]
    if (++count < maxCount && currentLength === nextLength) {
      continue
    } else if (count < minCount) {
      for (let i = 0; i < count; i++) {
        symbols.push(currentLength); extraBits.push(0); extraValues.push(0)
      }
    } else if (currentLength !== 0) {
      let c = count
      if (previousLength !== currentLength) {
        symbols.push(currentLength); extraBits.push(0); extraValues.push(0)
        c--
      }
      symbols.push(REP_3_6); extraBits.push(2); extraValues.push(c - 3)
    } else if (count <= 10) {
      symbols.push(REPZ_3_10); extraBits.push(3); extraValues.push(count - 3)
    } else {
      symbols.push(REPZ_11_138); extraBits.push(7); extraValues.push(count - 11)
    }
    count = 0
    previousLength = currentLength
    if (nextLength === 0) { maxCount = 138; minCount = 3 }
    else if (currentLength === nextLength) { maxCount = 6; minCount = 3 }
    else { maxCount = 7; minCount = 4 }
  }

  return { symbols, extraBits, extraValues }
}

// ============================================================================
// LZ77 token generator (mirrors ZlibSlow.sol).
//
// Lazy match strategy at zlib level 9 / Z_DEFAULT_STRATEGY. The hash chain is
// built incrementally; at each position we compare against the previous
// best match before committing.
//
// Output token format (parallel arrays):
//   kinds[i] = 0 → literal: values[i] is the byte
//   kinds[i] = 1 → match: values[i] is length (3..258), distances[i] is dist
// ============================================================================

function generateAllTokens(raw, inputLength) {
  // Caller guarantees raw.length >= inputLength + MAX_MATCH (read-ahead pad).
  // Conservative capacity: at most one token per input byte plus the final
  // literal flush.
  const capacity = inputLength + 1
  const kinds = new Uint8Array(capacity)
  const values = new Uint16Array(capacity)
  const distances = new Uint16Array(capacity)

  const head = new Int32Array(HASH_SIZE)
  const prev = new Int32Array(HASH_SIZE)

  let insertHash = 0
  let strstart = 0
  let lookahead = inputLength
  let matchLength = MIN_MATCH - 1
  let matchStart = 0
  let matchAvailable = false
  let tokenCount = 0

  while (lookahead > 0) {
    let hashHead = 0
    if (lookahead >= MIN_MATCH) {
      insertHash = ((insertHash << HASH_SHIFT) ^ raw[strstart + MIN_MATCH - 1]) & HASH_MASK
      hashHead = head[insertHash]
      prev[strstart & HASH_MASK] = hashHead
      head[insertHash] = strstart
    }

    const previousLength = matchLength
    const previousMatch = matchStart
    matchLength = MIN_MATCH - 1

    if (
      hashHead !== 0 &&
      previousLength < MAX_LAZY_MATCH &&
      strstart - hashHead <= MAX_DIST
    ) {
      const m = longestMatch(raw, prev, strstart, hashHead, previousLength, lookahead)
      matchLength = m.length
      if (matchLength > previousLength) matchStart = m.start

      if (matchLength <= 5 && matchLength === MIN_MATCH && strstart - matchStart > TOO_FAR) {
        matchLength = MIN_MATCH - 1
      }
    }

    if (previousLength >= MIN_MATCH && matchLength <= previousLength) {
      kinds[tokenCount] = 1
      values[tokenCount] = previousLength
      distances[tokenCount] = strstart - 1 - previousMatch
      tokenCount++

      const maxInsert = strstart + lookahead - MIN_MATCH
      lookahead -= previousLength - 1
      let remaining = previousLength - 2
      while (remaining !== 0) {
        strstart++
        if (strstart <= maxInsert && strstart + 2 < inputLength) {
          insertHash = ((insertHash << HASH_SHIFT) ^ raw[strstart + MIN_MATCH - 1]) & HASH_MASK
          const hh = head[insertHash]
          prev[strstart & HASH_MASK] = hh
          head[insertHash] = strstart
        }
        remaining--
      }
      matchAvailable = false
      matchLength = MIN_MATCH - 1
      strstart++
    } else if (matchAvailable) {
      kinds[tokenCount] = 0
      values[tokenCount] = raw[strstart - 1]
      distances[tokenCount] = 0
      tokenCount++
      strstart++
      lookahead--
    } else {
      matchAvailable = true
      strstart++
      lookahead--
    }
  }

  if (matchAvailable) {
    kinds[tokenCount] = 0
    values[tokenCount] = raw[strstart - 1]
    distances[tokenCount] = 0
    tokenCount++
  }

  return {
    kinds: kinds.subarray(0, tokenCount),
    values: values.subarray(0, tokenCount),
    distances: distances.subarray(0, tokenCount),
  }
}

function longestMatch(raw, prev, strstart, currentMatch, previousLength, lookahead) {
  let chainLength = MAX_CHAIN_LENGTH
  let bestLength = previousLength
  let bestStart = 0
  const niceMatch = NICE_MATCH < lookahead ? NICE_MATCH : lookahead
  const limit = strstart > MAX_DIST ? strstart - MAX_DIST : 0
  if (previousLength >= GOOD_MATCH) chainLength >>= 2

  const scan0 = raw[strstart]
  const scan1 = raw[strstart + 1]
  let scanEnd1 = raw[strstart + bestLength - 1]
  let scanEnd = raw[strstart + bestLength]
  let matchPos = currentMatch

  while (matchPos > limit && chainLength !== 0) {
    if (
      raw[matchPos + bestLength] === scanEnd &&
      raw[matchPos + bestLength - 1] === scanEnd1 &&
      raw[matchPos] === scan0 &&
      raw[matchPos + 1] === scan1
    ) {
      let length = 2
      const maxLength = MAX_MATCH < lookahead ? MAX_MATCH : lookahead
      while (length < maxLength && raw[matchPos + length] === raw[strstart + length]) {
        length++
      }
      if (length > bestLength) {
        bestLength = length
        bestStart = matchPos
        if (length >= niceMatch) break
        scanEnd1 = raw[strstart + bestLength - 1]
        scanEnd = raw[strstart + bestLength]
      }
    }
    matchPos = prev[matchPos & HASH_MASK]
    chainLength--
  }

  const finalLength = bestLength < lookahead ? bestLength : lookahead
  return { length: finalLength, start: bestStart }
}

// ============================================================================
// Dynamic block encoder (mirrors ZlibDynamicBlock.sol).
//
// Builds literal/length, distance, and bit-length Huffman trees over the
// supplied token slice; emits a fully-formed dynamic Huffman DEFLATE block
// straight into the given BitWriter.
// ============================================================================

function encodeDynamicBlock(writer, kinds, values, distances, start, end, finalBlock) {
  // 1. Frequencies
  const literalFreqs = new Uint32Array(L_CODES)
  const distanceFreqs = new Uint32Array(D_CODES)
  literalFreqs[END_BLOCK] = 1

  for (let i = start; i < end; i++) {
    if (kinds[i] === 0) {
      literalFreqs[values[i]]++
    } else {
      const lengthSym = LENGTH_SYMBOL[values[i]]
      literalFreqs[lengthSym]++
      const distSym = distanceSymbol(distances[i]).symbol
      distanceFreqs[distSym]++
    }
  }

  // 2. Build literal/length and distance trees.
  const literalTree = buildBitLengths(literalFreqs, L_CODES, MAX_BITS)
  const distanceTree = buildBitLengths(distanceFreqs, D_CODES, MAX_BITS)
  const literalLengths = literalTree.lengths
  const literalMaxCode = literalTree.maxCode
  const distanceLengths = distanceTree.lengths
  const distanceMaxCode = distanceTree.maxCode

  // 3. Build bit-length tree.
  const bitLengthFreqs = new Uint32Array(BL_CODES)
  scanTree(bitLengthFreqs, literalLengths, literalMaxCode)
  scanTree(bitLengthFreqs, distanceLengths, distanceMaxCode)
  const blTree = buildBitLengths(bitLengthFreqs, BL_CODES, MAX_BL_BITS)
  const bitLengthLengths = blTree.lengths
  const bitLengthMaxCode = blTree.maxCode

  let maxBlIndex = BL_CODES - 1
  while (
    maxBlIndex >= 3 &&
    lengthAt(bitLengthLengths, CODE_LENGTH_ORDER[maxBlIndex]) === 0
  ) maxBlIndex--
  if (maxBlIndex < 3) maxBlIndex = 3

  // 4. Build canonical codes.
  const bitLengthCodes = buildCanonicalCodes(bitLengthLengths, bitLengthMaxCode)
  const literalCodes = buildCanonicalCodes(literalLengths, literalMaxCode)
  const distanceCodes = buildCanonicalCodes(distanceLengths, distanceMaxCode)

  // 5. Emit block header.
  writer.writeBits(finalBlock ? 1 : 0, 1)
  writer.writeBits(2, 2)
  writer.writeBits(literalMaxCode + 1 - 257, 5)
  writer.writeBits(distanceMaxCode, 5)
  writer.writeBits(maxBlIndex + 1 - 4, 4)

  for (let rank = 0; rank <= maxBlIndex; rank++) {
    writer.writeBits(lengthAt(bitLengthLengths, CODE_LENGTH_ORDER[rank]), 3)
  }

  sendTree(writer, literalLengths, literalMaxCode, bitLengthLengths, bitLengthCodes)
  sendTree(writer, distanceLengths, distanceMaxCode, bitLengthLengths, bitLengthCodes)

  // 6. Emit token body.
  for (let i = start; i < end; i++) {
    if (kinds[i] === 0) {
      writeCode(writer, literalCodes, literalLengths, values[i])
    } else {
      const length = values[i]
      const lSym = LENGTH_SYMBOL[length]
      const lExtra = LENGTH_EXTRA_BITS[length]
      const lValue = LENGTH_EXTRA_VALUE[length]
      writeCode(writer, literalCodes, literalLengths, lSym)
      if (lExtra !== 0) writer.writeBits(lValue, lExtra)

      const distance = distances[i]
      const dSymObj = distanceSymbol(distance)
      writeCode(writer, distanceCodes, distanceLengths, dSymObj.symbol)
      if (dSymObj.extraBits !== 0) writer.writeBits(dSymObj.extraValue, dSymObj.extraBits)
    }
  }
  writeCode(writer, literalCodes, literalLengths, END_BLOCK)
}

function sendTree(writer, lengths, maxCode, blLengths, blCodes) {
  const { symbols, extraBits, extraValues } = encodeTree(lengths, maxCode)
  for (let i = 0; i < symbols.length; i++) {
    writeCode(writer, blCodes, blLengths, symbols[i])
    if (extraBits[i] !== 0) writer.writeBits(extraValues[i], extraBits[i])
  }
}

function writeCode(writer, codes, lengths, symbol) {
  const l = lengths[symbol]
  if (l === 0) throw new Error(`missing code for symbol ${symbol}`)
  writer.writeBits(codes[symbol], l)
}

function lengthAt(lengths, index) {
  return index < lengths.length ? lengths[index] : 0
}

// ============================================================================
// Mosaic scanline assembly.
//
// indexedPunks: array-of-Uint8Array (10000 entries, 576 bytes each) OR a flat
// Uint8Array of 5,760,000 bytes in punk-id order.
// palette: Uint8Array of paletteSize * 4 RGBA bytes.
// ============================================================================

function assembleScanlines(indexedPunks, palette) {
  if (palette.length < 4) throw new Error('palette must be RGBA bytes')
  const flat = Array.isArray(indexedPunks) || ArrayBuffer.isView(indexedPunks[0])
  const getPunk = flat
    ? (id) => indexedPunks[id]
    : (id) => indexedPunks.subarray(id * PUNK_PIXELS, (id + 1) * PUNK_PIXELS)

  if (flat && indexedPunks.length !== PUNK_COUNT) {
    throw new Error(`expected ${PUNK_COUNT} punks, got ${indexedPunks.length}`)
  }
  if (!flat && indexedPunks.length !== PUNK_COUNT * PUNK_PIXELS) {
    throw new Error(`expected ${PUNK_COUNT * PUNK_PIXELS} flat indexed bytes`)
  }

  const out = new Uint8Array(INFLATED_SCANLINE_BYTES)
  for (let y = 0; y < MOSAIC_SIZE; y++) {
    const scanlineOffset = y * SCANLINE_BYTES
    // filter byte 0 is already there from the zero-initialized buffer
    const gridY = (y / PUNK_SIZE) | 0
    const localY = y % PUNK_SIZE
    for (let col = 0; col < GRID_SIZE; col++) {
      const punk = getPunk(gridY * GRID_SIZE + col)
      const srcBase = localY * PUNK_SIZE
      let dst = scanlineOffset + 1 + col * PUNK_SIZE * RGBA
      for (let x = 0; x < PUNK_SIZE; x++) {
        const colorId = punk[srcBase + x]
        const palOff = colorId * 4
        out[dst++] = palette[palOff]
        out[dst++] = palette[palOff + 1]
        out[dst++] = palette[palOff + 2]
        out[dst++] = palette[palOff + 3]
      }
    }
  }
  return out
}

// ============================================================================
// zlib stream: header (0x78 0xDA) + DEFLATE blocks + Adler32.
// Partitions tokens into the canonical 23 blocks.
// ============================================================================

function encodeZlibStream(scanlines) {
  // LZ77 needs MAX_MATCH bytes of read-ahead padding.
  const padded = new Uint8Array(scanlines.length + MAX_MATCH)
  padded.set(scanlines)
  const { kinds, values, distances } = generateAllTokens(padded, scanlines.length)

  const totalTokens = kinds.length
  const expectedTotal =
    (DEFLATE_BLOCK_COUNT - 1) * FULL_DEFLATE_BLOCK_TOKENS + FINAL_DEFLATE_BLOCK_TOKENS
  if (totalTokens !== expectedTotal) {
    throw new Error(
      `expected ${expectedTotal} tokens for canonical partition, got ${totalTokens}`,
    )
  }

  const writer = new BitWriter(1 << 20)
  for (let block = 0; block < DEFLATE_BLOCK_COUNT; block++) {
    const start = block * FULL_DEFLATE_BLOCK_TOKENS
    const end = block === DEFLATE_BLOCK_COUNT - 1 ? totalTokens : start + FULL_DEFLATE_BLOCK_TOKENS
    const isFinal = block === DEFLATE_BLOCK_COUNT - 1
    encodeDynamicBlock(writer, kinds, values, distances, start, end, isFinal)
  }
  const deflateBytes = writer.result()

  const adler = adler32(scanlines)
  const idat = new Uint8Array(2 + deflateBytes.length + 4)
  idat[0] = 0x78
  idat[1] = 0xDA
  idat.set(deflateBytes, 2)
  const adlerOffset = 2 + deflateBytes.length
  idat[adlerOffset] = (adler >>> 24) & 0xFF
  idat[adlerOffset + 1] = (adler >>> 16) & 0xFF
  idat[adlerOffset + 2] = (adler >>> 8) & 0xFF
  idat[adlerOffset + 3] = adler & 0xFF
  return idat
}

// ============================================================================
// PNG framing (mirrors PngEncoder.sol structure for the mosaic).
// ============================================================================

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

function writeChunk(out, cursor, chunkType, payload) {
  const len = payload.length
  out[cursor] = (len >>> 24) & 0xFF
  out[cursor + 1] = (len >>> 16) & 0xFF
  out[cursor + 2] = (len >>> 8) & 0xFF
  out[cursor + 3] = len & 0xFF
  out[cursor + 4] = (chunkType >>> 24) & 0xFF
  out[cursor + 5] = (chunkType >>> 16) & 0xFF
  out[cursor + 6] = (chunkType >>> 8) & 0xFF
  out[cursor + 7] = chunkType & 0xFF
  if (len > 0) out.set(payload, cursor + 8)
  const crc = crc32(out, cursor + 4, 4 + len)
  const crcOff = cursor + 8 + len
  out[crcOff] = (crc >>> 24) & 0xFF
  out[crcOff + 1] = (crc >>> 16) & 0xFF
  out[crcOff + 2] = (crc >>> 8) & 0xFF
  out[crcOff + 3] = crc & 0xFF
  return crcOff + 4
}

function framePng(idat) {
  const TYPE_IHDR = 0x49484452
  const TYPE_IDAT = 0x49444154
  const TYPE_IEND = 0x49454E44

  // IHDR: width=2400, height=2400, bd=8, ct=6, cm=0, fm=0, im=0
  const ihdr = new Uint8Array(13)
  ihdr[2] = (MOSAIC_SIZE >>> 8) & 0xFF
  ihdr[3] = MOSAIC_SIZE & 0xFF
  ihdr[6] = (MOSAIC_SIZE >>> 8) & 0xFF
  ihdr[7] = MOSAIC_SIZE & 0xFF
  ihdr[8] = 8
  ihdr[9] = 6

  const idatChunks = Math.ceil(idat.length / IDAT_CHUNK_PAYLOAD_BYTES)
  const totalSize = 8 + 25 /* IHDR */ + idatChunks * 12 + idat.length + 12 /* IEND */
  const out = new Uint8Array(totalSize)

  out.set(PNG_SIGNATURE, 0)
  let cursor = 8
  cursor = writeChunk(out, cursor, TYPE_IHDR, ihdr)
  for (let offset = 0; offset < idat.length; offset += IDAT_CHUNK_PAYLOAD_BYTES) {
    const chunkLen = Math.min(IDAT_CHUNK_PAYLOAD_BYTES, idat.length - offset)
    cursor = writeChunk(out, cursor, TYPE_IDAT, idat.subarray(offset, offset + chunkLen))
  }
  cursor = writeChunk(out, cursor, TYPE_IEND, new Uint8Array(0))

  if (cursor !== totalSize) throw new Error(`framing length mismatch: ${cursor} vs ${totalSize}`)
  return out
}

// ============================================================================
// Public API.
// ============================================================================

export function renderPunksPng(indexedPunks, palette) {
  const scanlines = assembleScanlines(indexedPunks, palette)
  const idat = encodeZlibStream(scanlines)
  return framePng(idat)
}

// Lower-level entry points exposed for tooling and incremental verification.
export {
  assembleScanlines,
  encodeZlibStream,
  framePng,
  adler32,
  crc32,
  generateAllTokens,
  encodeDynamicBlock,
  BitWriter,
  INFLATED_SCANLINE_BYTES,
  SCANLINE_BYTES,
  MOSAIC_SIZE,
}
