import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const EXPECTED_PNG_SHA256 =
  'ac39af4793119ee46bbff351d8cb6b5f23da60222126add4268e261199a2921b'
const EXPECTED_IDAT_SHA256 =
  '7d080b4bca3e4c8e19ed53254eb8dc1dd1c887c8b6b3560d3374436c19f9614f'
const EXPECTED_SCANLINES_SHA256 =
  '62a66b4618a72410d6d99b5fceee6013fabcb3574728ed5ce437b2a161da8673'
const EXPECTED_IDAT_LENGTH = 847_817
const EXPECTED_SCANLINES_LENGTH = 23_042_400
const EXPECTED_PNG_LENGTH = 848_174
const EXPECTED_BLOCK_COUNTS = [
  16_383, 16_383, 16_383, 16_383, 16_383, 16_383, 16_383, 16_383,
  16_383, 16_383, 16_383, 16_383, 16_383, 16_383, 16_383, 16_383,
  16_383, 16_383, 16_383, 16_383, 16_383, 16_383, 3_537,
]
const EXPECTED_BLOCK_OUT_ENDS = [
  1_075_553, 2_181_796, 3_247_978, 4_293_495, 5_376_040,
  6_386_042, 7_458_564, 8_470_335, 9_545_347, 10_564_580,
  11_632_119, 12_628_996, 13_693_158, 14_680_234, 15_737_120,
  16_723_822, 17_759_827, 18_782_505, 19_786_532, 20_825_577,
  21_793_818, 22_851_278, 23_042_400,
]

const MIN_MATCH = 3
const MAX_MATCH = 258
const WSIZE = 32_768
const MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1
const MAX_DIST = WSIZE - MIN_LOOKAHEAD
const TOO_FAR = 4_096
const HASH_BITS = 15
const HASH_SIZE = 1 << HASH_BITS
const HASH_MASK = HASH_SIZE - 1
const HASH_SHIFT = Math.floor((HASH_BITS + MIN_MATCH - 1) / MIN_MATCH)
const GOOD_MATCH = 32
const MAX_LAZY_MATCH = 258
const NICE_MATCH = 258
const MAX_CHAIN_LENGTH = 4_096

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]
const L_CODES = 286
const D_CODES = 30
const BL_CODES = 19
const END_BLOCK = 256
const MAX_BITS = 15
const MAX_BL_BITS = 7
const REP_3_6 = 16
const REPZ_3_10 = 17
const REPZ_11_138 = 18
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]

type ParsedTokens = {
  positions: number[]
  kinds: number[]
  values: number[]
  distances: number[]
  blocks: ParsedBlock[]
  blockCounts: number[]
  blockOutEnds: number[]
  literals: number
  matches: number
}

type ParsedBlock = {
  final: number
  blockStartBit: number
  bodyStartBit: number
  bodyEndBit: number
  blockEndBit: number
  tokenStart: number
  tokenEnd: number
  literalLengthLengths: number[]
  distanceLengths: number[]
}

type HuffmanTable = {
  maxBits: number
  symbolsByKey: Map<number, number>
}

type HuffmanCodeMap = Array<{ code: number, length: number } | undefined>

type GeneratedTree = {
  lengths: number[]
  maxCode: number
}

type GeneratedBlockTrees = {
  literalTree: GeneratedTree
  distanceTree: GeneratedTree
  bitLengthTree: GeneratedTree
  maxBlIndex: number
}

class BitReader {
  private bit = 0

  constructor(private readonly bytes: Uint8Array) {}

  get bitPosition(): number {
    return this.bit
  }

  readBits(count: number): number {
    let value = 0
    for (let i = 0; i < count; i++) {
      value |= ((this.bytes[this.bit >> 3] >> (this.bit & 7)) & 1) << i
      this.bit++
    }
    return value
  }
}

class BitWriter {
  private readonly bits: number[] = []

  get bitLength(): number {
    return this.bits.length
  }

  writeBits(value: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.bits.push((value >> i) & 1)
    }
  }

  bitAt(index: number): number {
    return this.bits[index]
  }

  toBuffer(): Buffer {
    const out = Buffer.alloc(Math.ceil(this.bits.length / 8))
    for (let i = 0; i < this.bits.length; i++) {
      out[i >> 3] |= this.bits[i] << (i & 7)
    }
    return out
  }
}

function main() {
  const png = readLocalPunksPng()
  requireEqual(sha256Hex(png), EXPECTED_PNG_SHA256, 'punks.png sha256')

  const idat = extractIdat(png)
  requireEqual(idat.length, EXPECTED_IDAT_LENGTH, 'IDAT length')
  requireEqual(sha256Hex(idat), EXPECTED_IDAT_SHA256, 'IDAT sha256')

  const scanlines = inflateSync(idat)
  requireEqual(scanlines.length, EXPECTED_SCANLINES_LENGTH, 'inflated scanline length')
  requireEqual(sha256Hex(scanlines), EXPECTED_SCANLINES_SHA256, 'inflated scanline sha256')

  console.log(`punks.png ${png.length} bytes`)
  console.log(`IDAT ${idat.length} bytes`)
  console.log(`Inflated scanlines ${scanlines.length} bytes`)

  const parsed = parseDeflateTokens(idat.subarray(2, idat.length - 4))
  requireArrayEqual(parsed.blockCounts, EXPECTED_BLOCK_COUNTS, 'block token counts')
  requireArrayEqual(parsed.blockOutEnds, EXPECTED_BLOCK_OUT_ENDS, 'block output ends')

  console.log(`Parsed dynamic blocks ${parsed.blockCounts.length}`)
  console.log(`Parsed non-EOB tokens ${parsed.kinds.length}`)
  console.log(`Parsed literals ${parsed.literals}`)
  console.log(`Parsed matches ${parsed.matches}`)
  if (process.env.PUNKS_DEFLATE_PRINT_BLOCKS === '1') {
    logDeflateBlockRanges(parsed)
  }
  if (process.env.PUNKS_DEFLATE_DUMP_BLOCK_TOKENS) {
    dumpBlockTokens(parsed, process.env.PUNKS_DEFLATE_DUMP_BLOCK_TOKENS)
  }

  const generated = generateZlibSlowTokens(scanlines)
  compareTokenStreams(generated, parsed)
  verifyWindowedBlockTokenGeneration(scanlines, parsed)
  verifyZlibTreeLengths(parsed)
  verifyTokenBodyReEmission(idat.subarray(2, idat.length - 4), parsed)
  const deflatePayload = verifyFullDeflateReEmission(idat.subarray(2, idat.length - 4), generated)
  const generatedIdat = buildZlibPayload(scanlines, deflatePayload)
  requireBufferEqual(generatedIdat, idat, 'generated IDAT payload')
  const generatedPng = buildPng(generatedIdat)
  requireEqual(generatedPng.length, EXPECTED_PNG_LENGTH, 'generated PNG length')
  requireBufferEqual(generatedPng, png, 'generated PNG bytes')

  console.log('zlib 1.3.1 level-9 token stream matches reference punks.png')
  console.log('zlib dynamic literal/distance tree lengths match reference blocks')
  console.log('dynamic Huffman token bodies re-emit byte-for-byte')
  console.log('full dynamic DEFLATE payload re-emits byte-for-byte')
  console.log('generated zlib IDAT and PNG bytes match reference punks.png')
}

function logDeflateBlockRanges(parsed: ParsedTokens) {
  console.log('Deflate block bit ranges inside concatenated raw DEFLATE payload:')
  for (let i = 0; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i]
    console.log(
      `${i}: bits ${block.blockStartBit}..${block.blockEndBit}`
        + ` bytes ${Math.floor(block.blockStartBit / 8)}..${Math.ceil(block.blockEndBit / 8)}`,
    )
  }
}

function dumpBlockTokens(parsed: ParsedTokens, path: string) {
  const blockIndex = Number(process.env.PUNKS_DEFLATE_DUMP_BLOCK ?? 0)
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= parsed.blocks.length) {
    throw new Error('PUNKS_DEFLATE_DUMP_BLOCK must be an integer in range')
  }
  const block = parsed.blocks[blockIndex]
  writeFileSync(path, JSON.stringify({
    blockIndex,
    kinds: parsed.kinds.slice(block.tokenStart, block.tokenEnd),
    values: parsed.values.slice(block.tokenStart, block.tokenEnd),
    distances: parsed.distances.slice(block.tokenStart, block.tokenEnd),
    finalBlock: block.final === 1,
  }))
  console.log(`wrote block ${blockIndex} tokens to ${path}`)
}

function readLocalPunksPng(): Buffer {
  const candidates = [
    join(process.cwd(), 'punks.png'),
    join(process.cwd(), '..', 'punks.png'),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (path === undefined) {
    throw new Error(`punks.png not found in ${candidates.join(' or ')}`)
  }
  return readFileSync(path)
}

function extractIdat(png: Uint8Array): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex')
  if (!Buffer.from(png.subarray(0, 8)).equals(signature)) {
    throw new Error('invalid PNG signature')
  }

  const parts: Uint8Array[] = []
  let offset = 8
  while (offset < png.length) {
    const length = readU32BE(png, offset)
    const type = Buffer.from(png.subarray(offset + 4, offset + 8)).toString('ascii')
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > png.length) throw new Error(`chunk ${type} overruns PNG`)
    if (type === 'IDAT') parts.push(png.subarray(dataStart, dataEnd))
    offset = dataEnd + 4
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

function parseDeflateTokens(payload: Uint8Array): ParsedTokens {
  const reader = new BitReader(payload)
  const positions: number[] = []
  const kinds: number[] = []
  const values: number[] = []
  const distances: number[] = []
  const blocks: ParsedBlock[] = []
  const blockCounts: number[] = []
  const blockOutEnds: number[] = []
  let outputPosition = 0
  let literals = 0
  let matches = 0

  for (;;) {
    const blockStartBit = reader.bitPosition
    const final = reader.readBits(1)
    const blockType = reader.readBits(2)
    if (blockType !== 2) throw new Error(`unsupported DEFLATE block type ${blockType}`)

    const hlit = reader.readBits(5) + 257
    const hdist = reader.readBits(5) + 1
    const hclen = reader.readBits(4) + 4
    const codeLengthLengths = Array<number>(19).fill(0)
    for (let i = 0; i < hclen; i++) {
      codeLengthLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3)
    }

    const codeLengthTable = buildHuffmanTable(codeLengthLengths)
    const lengths: number[] = []
    while (lengths.length < hlit + hdist) {
      const symbol = decodeSymbol(reader, codeLengthTable)
      if (symbol <= 15) {
        lengths.push(symbol)
      } else if (symbol === 16) {
        const repeat = reader.readBits(2) + 3
        if (lengths.length === 0) throw new Error('repeat previous code length without previous length')
        for (let i = 0; i < repeat; i++) lengths.push(lengths[lengths.length - 1])
      } else if (symbol === 17) {
        const repeat = reader.readBits(3) + 3
        for (let i = 0; i < repeat; i++) lengths.push(0)
      } else if (symbol === 18) {
        const repeat = reader.readBits(7) + 11
        for (let i = 0; i < repeat; i++) lengths.push(0)
      } else {
        throw new Error(`invalid code-length symbol ${symbol}`)
      }
    }

    const literalLengthLengths = lengths.slice(0, hlit)
    const distanceLengths = lengths.slice(hlit)
    const literalLengthTable = buildHuffmanTable(literalLengthLengths)
    const distanceTable = buildHuffmanTable(distanceLengths)
    const blockTokenStart = kinds.length
    const bodyStartBit = reader.bitPosition

    for (;;) {
      const symbol = decodeSymbol(reader, literalLengthTable)
      if (symbol < 256) {
        positions.push(outputPosition)
        kinds.push(0)
        values.push(symbol)
        distances.push(0)
        outputPosition++
        literals++
      } else if (symbol === 256) {
        break
      } else {
        const lengthIndex = symbol - 257
        if (lengthIndex < 0 || lengthIndex >= LENGTH_BASE.length) {
          throw new Error(`invalid length symbol ${symbol}`)
        }
        const extraLengthBits = LENGTH_EXTRA[lengthIndex]
        const length = LENGTH_BASE[lengthIndex]
          + (extraLengthBits === 0 ? 0 : reader.readBits(extraLengthBits))
        const distanceSymbol = decodeSymbol(reader, distanceTable)
        if (distanceSymbol >= DIST_BASE.length) {
          throw new Error(`invalid distance symbol ${distanceSymbol}`)
        }
        const extraDistanceBits = DIST_EXTRA[distanceSymbol]
        const distance = DIST_BASE[distanceSymbol]
          + (extraDistanceBits === 0 ? 0 : reader.readBits(extraDistanceBits))

        positions.push(outputPosition)
        kinds.push(1)
        values.push(length)
        distances.push(distance)
        outputPosition += length
        matches++
      }
    }

    blockCounts.push(kinds.length - blockTokenStart)
    blockOutEnds.push(outputPosition)
    blocks.push({
      final,
      blockStartBit,
      bodyStartBit,
      bodyEndBit: reader.bitPosition,
      blockEndBit: reader.bitPosition,
      tokenStart: blockTokenStart,
      tokenEnd: kinds.length,
      literalLengthLengths,
      distanceLengths,
    })
    if (final === 1) break
  }

  return { positions, kinds, values, distances, blocks, blockCounts, blockOutEnds, literals, matches }
}

function generateZlibSlowTokens(scanlines: Uint8Array): ParsedTokens {
  const raw = Buffer.concat([Buffer.from(scanlines), Buffer.alloc(MAX_MATCH)])
  const inputLength = scanlines.length
  const head = new Int32Array(HASH_SIZE)
  const previous = new Int32Array(inputLength + MAX_MATCH)
  const positions: number[] = []
  const kinds: number[] = []
  const values: number[] = []
  const distances: number[] = []
  const blocks: ParsedBlock[] = []
  const blockCounts: number[] = []
  const blockOutEnds: number[] = []

  let insertHash = 0
  let strstart = 0
  let lookahead = inputLength
  let matchLength = MIN_MATCH - 1
  let matchStart = 0
  let matchAvailable = false
  let literals = 0
  let matches = 0
  let blockStart = 0

  const emit = (position: number, kind: number, value: number, distance: number) => {
    positions.push(position)
    kinds.push(kind)
    values.push(value)
    distances.push(distance)
    if (kind === 0) literals++
    else matches++

    if (kinds.length - blockStart === 16_383) {
      blockCounts.push(kinds.length - blockStart)
      blockOutEnds.push(position + (kind === 0 ? 1 : value))
      blocks.push({
        final: 0,
        blockStartBit: 0,
        bodyStartBit: 0,
        bodyEndBit: 0,
        blockEndBit: 0,
        tokenStart: blockStart,
        tokenEnd: kinds.length,
        literalLengthLengths: [],
        distanceLengths: [],
      })
      blockStart = kinds.length
    }
  }

  while (lookahead > 0) {
    let hashHead = 0
    if (lookahead >= MIN_MATCH) {
      ;[insertHash, hashHead] = insertString(raw, head, previous, strstart, insertHash)
    }

    let previousLength = matchLength
    const previousMatch = matchStart
    matchLength = MIN_MATCH - 1

    if (
      hashHead !== 0
      && previousLength < MAX_LAZY_MATCH
      && strstart - hashHead <= MAX_DIST
    ) {
      const match = longestMatch(raw, previous, strstart, hashHead, previousLength, lookahead)
      matchLength = match.length
      if (matchLength > previousLength) matchStart = match.start

      if (
        matchLength <= 5
        && matchLength === MIN_MATCH
        && strstart - matchStart > TOO_FAR
      ) {
        matchLength = MIN_MATCH - 1
      }
    }

    if (previousLength >= MIN_MATCH && matchLength <= previousLength) {
      emit(strstart - 1, 1, previousLength, strstart - 1 - previousMatch)

      const maxInsert = strstart + lookahead - MIN_MATCH
      lookahead -= previousLength - 1
      previousLength -= 2
      while (previousLength !== 0) {
        strstart++
        if (strstart <= maxInsert && strstart + 2 < inputLength) {
          ;[insertHash] = insertString(raw, head, previous, strstart, insertHash)
        }
        previousLength--
      }
      matchAvailable = false
      matchLength = MIN_MATCH - 1
      strstart++
    } else if (matchAvailable) {
      emit(strstart - 1, 0, raw[strstart - 1], 0)
      strstart++
      lookahead--
    } else {
      matchAvailable = true
      strstart++
      lookahead--
    }
  }

  if (matchAvailable) {
    emit(strstart - 1, 0, raw[strstart - 1], 0)
  }

  if (blockStart < kinds.length) {
    const last = kinds.length - 1
    blockCounts.push(kinds.length - blockStart)
    blockOutEnds.push(positions[last] + (kinds[last] === 0 ? 1 : values[last]))
    blocks.push({
      final: 1,
      blockStartBit: 0,
      bodyStartBit: 0,
      bodyEndBit: 0,
      blockEndBit: 0,
      tokenStart: blockStart,
      tokenEnd: kinds.length,
      literalLengthLengths: [],
      distanceLengths: [],
    })
  }

  return { positions, kinds, values, distances, blocks, blockCounts, blockOutEnds, literals, matches }
}

function verifyWindowedBlockTokenGeneration(scanlines: Uint8Array, expected: ParsedTokens) {
  const warmupBytes = Number(process.env.PUNKS_DEFLATE_WINDOW_WARMUP ?? 65_536)
  for (let blockIndex = 0; blockIndex < expected.blocks.length; blockIndex++) {
    const block = expected.blocks[blockIndex]
    const startOffset = blockIndex === 0 ? 0 : expected.blockOutEnds[blockIndex - 1]
    const endOffset = expected.blockOutEnds[blockIndex]
    const baseOffset = Math.max(0, startOffset - warmupBytes)
    const readEnd = Math.min(scanlines.length, endOffset + MIN_LOOKAHEAD)
    const actual = generateZlibSlowBlockWindow(
      scanlines.subarray(baseOffset, readEnd),
      baseOffset,
      startOffset,
      block.tokenEnd - block.tokenStart,
    )

    for (let i = 0; i < actual.kinds.length; i++) {
      assertExpectedToken(
        expected,
        block.tokenStart + i,
        actual.positions[i],
        actual.kinds[i],
        actual.values[i],
        actual.distances[i],
      )
    }
  }
  console.log(`windowed block token generation matches reference (${warmupBytes} byte warmup)`)
}

function generateZlibSlowBlockWindow(
  input: Uint8Array,
  baseOffset: number,
  startOffset: number,
  maxTokens: number,
): Pick<ParsedTokens, 'positions' | 'kinds' | 'values' | 'distances'> {
  const raw = Buffer.concat([Buffer.from(input), Buffer.alloc(MAX_MATCH)])
  const inputLength = input.length
  const head = new Int32Array(HASH_SIZE)
  const previous = new Int32Array(inputLength + MAX_MATCH)
  const positions: number[] = []
  const kinds: number[] = []
  const values: number[] = []
  const distances: number[] = []

  let insertHash = 0
  let strstart = 0
  let lookahead = inputLength
  let matchLength = MIN_MATCH - 1
  let matchStart = 0
  let matchAvailable = false

  const emit = (position: number, kind: number, value: number, distance: number) => {
    const absolute = baseOffset + position
    if (absolute < startOffset) {
      if (absolute + (kind === 0 ? 1 : value) > startOffset) {
        throw new Error(`window token crosses block start ${startOffset}`)
      }
      return
    }
    if (positions.length >= maxTokens) return
    positions.push(absolute)
    kinds.push(kind)
    values.push(value)
    distances.push(distance)
  }

  while (lookahead > 0 && positions.length < maxTokens) {
    let hashHead = 0
    if (lookahead >= MIN_MATCH) {
      ;[insertHash, hashHead] = insertString(raw, head, previous, strstart, insertHash)
    }

    let previousLength = matchLength
    const previousMatch = matchStart
    matchLength = MIN_MATCH - 1

    if (
      hashHead !== 0
      && previousLength < MAX_LAZY_MATCH
      && strstart - hashHead <= MAX_DIST
    ) {
      const match = longestMatch(raw, previous, strstart, hashHead, previousLength, lookahead)
      matchLength = match.length
      if (matchLength > previousLength) matchStart = match.start

      if (
        matchLength <= 5
        && matchLength === MIN_MATCH
        && strstart - matchStart > TOO_FAR
      ) {
        matchLength = MIN_MATCH - 1
      }
    }

    if (previousLength >= MIN_MATCH && matchLength <= previousLength) {
      emit(strstart - 1, 1, previousLength, strstart - 1 - previousMatch)

      const maxInsert = strstart + lookahead - MIN_MATCH
      lookahead -= previousLength - 1
      previousLength -= 2
      while (previousLength !== 0) {
        strstart++
        if (strstart <= maxInsert && strstart + 2 < inputLength) {
          ;[insertHash] = insertString(raw, head, previous, strstart, insertHash)
        }
        previousLength--
      }
      matchAvailable = false
      matchLength = MIN_MATCH - 1
      strstart++
    } else if (matchAvailable) {
      emit(strstart - 1, 0, raw[strstart - 1], 0)
      strstart++
      lookahead--
    } else {
      matchAvailable = true
      strstart++
      lookahead--
    }
  }

  if (matchAvailable && positions.length < maxTokens) {
    emit(strstart - 1, 0, raw[strstart - 1], 0)
  }

  if (positions.length !== maxTokens) {
    throw new Error(`window generated ${positions.length} tokens, expected ${maxTokens}`)
  }
  return { positions, kinds, values, distances }
}

function compareTokenStreams(actual: ParsedTokens, expected: ParsedTokens) {
  requireEqual(actual.kinds.length, expected.kinds.length, 'simulated token count')
  requireEqual(actual.literals, expected.literals, 'simulated literal count')
  requireEqual(actual.matches, expected.matches, 'simulated match count')
  requireArrayEqual(actual.blockCounts, expected.blockCounts, 'simulated block token counts')
  requireArrayEqual(actual.blockOutEnds, expected.blockOutEnds, 'simulated block output ends')

  for (let i = 0; i < expected.kinds.length; i++) {
    assertExpectedToken(
      expected,
      i,
      actual.positions[i],
      actual.kinds[i],
      actual.values[i],
      actual.distances[i],
    )
  }

  console.log(`Simulated literals ${actual.literals}`)
  console.log(`Simulated matches ${actual.matches}`)
  console.log(`Simulated non-EOB tokens ${actual.kinds.length}`)
}

function verifyTokenBodyReEmission(payload: Uint8Array, parsed: ParsedTokens) {
  for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex++) {
    const block = parsed.blocks[blockIndex]
    const literalLengthCodes = buildHuffmanCodeMap(block.literalLengthLengths)
    const distanceCodes = buildHuffmanCodeMap(block.distanceLengths)
    const writer = new BitWriter()

    for (let i = block.tokenStart; i < block.tokenEnd; i++) {
      if (parsed.kinds[i] === 0) {
        writeCode(writer, literalLengthCodes, parsed.values[i])
      } else {
        const length = parsed.values[i]
        const lengthCode = lengthSymbol(length)
        writeCode(writer, literalLengthCodes, lengthCode.symbol)
        if (lengthCode.extraBits !== 0) writer.writeBits(lengthCode.extraValue, lengthCode.extraBits)

        const distance = parsed.distances[i]
        const distanceCode = distanceSymbol(distance)
        writeCode(writer, distanceCodes, distanceCode.symbol)
        if (distanceCode.extraBits !== 0) {
          writer.writeBits(distanceCode.extraValue, distanceCode.extraBits)
        }
      }
    }

    writeCode(writer, literalLengthCodes, 256)

    const expectedBitLength = block.bodyEndBit - block.bodyStartBit
    requireEqual(writer.bitLength, expectedBitLength, `block ${blockIndex} token-body bit length`)
    for (let bit = 0; bit < writer.bitLength; bit++) {
      const actual = writer.bitAt(bit)
      const expected = readPayloadBit(payload, block.bodyStartBit + bit)
      if (actual !== expected) {
        throw new Error(
          `block ${blockIndex} token-body bit ${bit}: ${actual} != ${expected}`,
        )
      }
    }
  }
}

function verifyZlibTreeLengths(parsed: ParsedTokens) {
  for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex++) {
    const block = parsed.blocks[blockIndex]
    const { literalTree, distanceTree } = buildGeneratedBlockTrees(parsed, block)
    const literalLengthLengths = literalTree.lengths.slice(0, literalTree.maxCode + 1)
    const distanceLengths = distanceTree.lengths.slice(0, distanceTree.maxCode + 1)

    requireArrayEqual(
      literalLengthLengths,
      block.literalLengthLengths,
      `block ${blockIndex} literal/length code lengths`,
    )
    requireArrayEqual(
      distanceLengths,
      block.distanceLengths,
      `block ${blockIndex} distance code lengths`,
    )
  }
}

function verifyFullDeflateReEmission(payload: Uint8Array, parsed: ParsedTokens): Buffer {
  const writer = new BitWriter()

  for (const block of parsed.blocks) {
    const trees = buildGeneratedBlockTrees(parsed, block)
    writeDynamicBlock(writer, parsed, block, trees)
  }

  while (writer.bitLength % 8 !== 0) writer.writeBits(0, 1)

  requireEqual(writer.bitLength, payload.length * 8, 'full DEFLATE payload bit length')
  for (let bit = 0; bit < writer.bitLength; bit++) {
    const actual = writer.bitAt(bit)
    const expected = readPayloadBit(payload, bit)
    if (actual !== expected) {
      throw new Error(`full DEFLATE payload bit ${bit}: ${actual} != ${expected}`)
    }
  }
  return writer.toBuffer()
}

function buildZlibPayload(scanlines: Uint8Array, deflatePayload: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from([0x78, 0xda]),
    Buffer.from(deflatePayload),
    writeU32BE(adler32(scanlines)),
  ])
}

function buildPng(idat: Uint8Array): Buffer {
  const parts = [
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', Buffer.from([
      0x00, 0x00, 0x09, 0x60,
      0x00, 0x00, 0x09, 0x60,
      0x08, 0x06, 0x00, 0x00, 0x00,
    ])),
  ]
  for (let offset = 0; offset < idat.length; offset += 32_768) {
    parts.push(pngChunk('IDAT', idat.subarray(offset, offset + 32_768)))
  }
  parts.push(pngChunk('IEND', new Uint8Array()))
  return Buffer.concat(parts)
}

function pngChunk(type: string, payload: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + payload.length)
  writeU32BE(payload.length).copy(out, 0)
  typeBytes.copy(out, 4)
  Buffer.from(payload).copy(out, 8)
  writeU32BE(crc32(out.subarray(4, 8 + payload.length))).copy(out, 8 + payload.length)
  return out
}

function writeDynamicBlock(
  writer: BitWriter,
  parsed: ParsedTokens,
  block: ParsedBlock,
  trees: GeneratedBlockTrees,
) {
  const lcodes = trees.literalTree.maxCode + 1
  const dcodes = trees.distanceTree.maxCode + 1
  const blcodes = trees.maxBlIndex + 1

  writer.writeBits(block.final, 1)
  writer.writeBits(2, 2)
  writer.writeBits(lcodes - 257, 5)
  writer.writeBits(dcodes - 1, 5)
  writer.writeBits(blcodes - 4, 4)

  for (let rank = 0; rank < blcodes; rank++) {
    writer.writeBits(trees.bitLengthTree.lengths[CODE_LENGTH_ORDER[rank]], 3)
  }

  const bitLengthCodes = buildHuffmanCodeMap(trees.bitLengthTree.lengths)
  sendTree(writer, trees.literalTree.lengths, lcodes - 1, bitLengthCodes)
  sendTree(writer, trees.distanceTree.lengths, dcodes - 1, bitLengthCodes)

  const literalLengthCodes = buildHuffmanCodeMap(trees.literalTree.lengths)
  const distanceCodes = buildHuffmanCodeMap(trees.distanceTree.lengths)
  writeTokenBody(writer, parsed, block, literalLengthCodes, distanceCodes)
}

function buildGeneratedBlockTrees(parsed: ParsedTokens, block: ParsedBlock): GeneratedBlockTrees {
  const literalLengthFreqs = Array<number>(L_CODES).fill(0)
  const distanceFreqs = Array<number>(D_CODES).fill(0)
  literalLengthFreqs[END_BLOCK] = 1

  for (let i = block.tokenStart; i < block.tokenEnd; i++) {
    if (parsed.kinds[i] === 0) {
      literalLengthFreqs[parsed.values[i]]++
    } else {
      literalLengthFreqs[lengthSymbol(parsed.values[i]).symbol]++
      distanceFreqs[distanceSymbol(parsed.distances[i]).symbol]++
    }
  }

  const literalTree = buildZlibBitLengths(literalLengthFreqs, L_CODES, MAX_BITS)
  const distanceTree = buildZlibBitLengths(distanceFreqs, D_CODES, MAX_BITS)
  const bitLengthFreqs = Array<number>(BL_CODES).fill(0)
  scanTree(bitLengthFreqs, literalTree.lengths, literalTree.maxCode)
  scanTree(bitLengthFreqs, distanceTree.lengths, distanceTree.maxCode)
  const bitLengthTree = buildZlibBitLengths(bitLengthFreqs, BL_CODES, MAX_BL_BITS)

  let maxBlIndex = BL_CODES - 1
  while (maxBlIndex >= 3 && bitLengthTree.lengths[CODE_LENGTH_ORDER[maxBlIndex]] === 0) {
    maxBlIndex--
  }

  return { literalTree, distanceTree, bitLengthTree, maxBlIndex }
}

function scanTree(bitLengthFreqs: number[], lengths: number[], maxCode: number) {
  let previousLength = -1
  let currentLength: number
  let nextLength = lengths[0]
  let count = 0
  let maxCount = 7
  let minCount = 4

  if (nextLength === 0) {
    maxCount = 138
    minCount = 3
  }

  for (let n = 0; n <= maxCode; n++) {
    currentLength = nextLength
    nextLength = n === maxCode ? 0xffff : lengths[n + 1]
    if (++count < maxCount && currentLength === nextLength) {
      continue
    } else if (count < minCount) {
      bitLengthFreqs[currentLength] += count
    } else if (currentLength !== 0) {
      if (currentLength !== previousLength) bitLengthFreqs[currentLength]++
      bitLengthFreqs[REP_3_6]++
    } else if (count <= 10) {
      bitLengthFreqs[REPZ_3_10]++
    } else {
      bitLengthFreqs[REPZ_11_138]++
    }

    count = 0
    previousLength = currentLength
    if (nextLength === 0) {
      maxCount = 138
      minCount = 3
    } else if (currentLength === nextLength) {
      maxCount = 6
      minCount = 3
    } else {
      maxCount = 7
      minCount = 4
    }
  }
}

function sendTree(
  writer: BitWriter,
  lengths: number[],
  maxCode: number,
  bitLengthCodes: HuffmanCodeMap,
) {
  let previousLength = -1
  let currentLength: number
  let nextLength = lengths[0]
  let count = 0
  let maxCount = 7
  let minCount = 4

  if (nextLength === 0) {
    maxCount = 138
    minCount = 3
  }

  for (let n = 0; n <= maxCode; n++) {
    currentLength = nextLength
    nextLength = n === maxCode ? 0xffff : lengths[n + 1]
    if (++count < maxCount && currentLength === nextLength) {
      continue
    } else if (count < minCount) {
      do {
        writeCode(writer, bitLengthCodes, currentLength)
      } while (--count !== 0)
    } else if (currentLength !== 0) {
      if (currentLength !== previousLength) {
        writeCode(writer, bitLengthCodes, currentLength)
        count--
      }
      writeCode(writer, bitLengthCodes, REP_3_6)
      writer.writeBits(count - 3, 2)
    } else if (count <= 10) {
      writeCode(writer, bitLengthCodes, REPZ_3_10)
      writer.writeBits(count - 3, 3)
    } else {
      writeCode(writer, bitLengthCodes, REPZ_11_138)
      writer.writeBits(count - 11, 7)
    }

    count = 0
    previousLength = currentLength
    if (nextLength === 0) {
      maxCount = 138
      minCount = 3
    } else if (currentLength === nextLength) {
      maxCount = 6
      minCount = 3
    } else {
      maxCount = 7
      minCount = 4
    }
  }
}

function buildZlibBitLengths(
  frequencies: number[],
  elementCount: number,
  maxLength: number,
): GeneratedTree {
  const heapCapacity = elementCount * 2 + 1
  const tree = Array.from(
    { length: heapCapacity },
    (_, i) => ({
      freq: i < frequencies.length ? frequencies[i] : 0,
      dad: 0,
      len: 0,
    }),
  )
  const heap = Array<number>(heapCapacity).fill(0)
  const depth = Array<number>(heapCapacity).fill(0)
  const bitLengthCounts = Array<number>(MAX_BITS + 1).fill(0)

  let heapLength = 0
  let heapMax = heapCapacity
  let maxCode = -1
  for (let n = 0; n < elementCount; n++) {
    if (tree[n].freq !== 0) {
      heap[++heapLength] = n
      maxCode = n
      depth[n] = 0
    } else {
      tree[n].len = 0
    }
  }

  while (heapLength < 2) {
    const node = maxCode < 2 ? ++maxCode : 0
    heap[++heapLength] = node
    tree[node].freq = 1
    depth[node] = 0
  }

  for (let n = Math.floor(heapLength / 2); n >= 1; n--) {
    heapLength = pqdownheap(tree, heap, depth, heapLength, n)
  }

  let node = elementCount
  do {
    const first = heap[1]
    heap[1] = heap[heapLength--]
    heapLength = pqdownheap(tree, heap, depth, heapLength, 1)
    const second = heap[1]

    heap[--heapMax] = first
    heap[--heapMax] = second

    tree[node].freq = tree[first].freq + tree[second].freq
    depth[node] = Math.max(depth[first], depth[second]) + 1
    tree[first].dad = node
    tree[second].dad = node
    heap[1] = node++
    heapLength = pqdownheap(tree, heap, depth, heapLength, 1)
  } while (heapLength >= 2)

  heap[--heapMax] = heap[1]
  generateZlibBitLengths(tree, heap, bitLengthCounts, heapMax, heapCapacity, maxCode, maxLength)
  return {
    lengths: tree.slice(0, elementCount).map((entry) => entry.len),
    maxCode,
  }
}

function pqdownheap(
  tree: Array<{ freq: number, dad: number, len: number }>,
  heap: number[],
  depth: number[],
  heapLength: number,
  start: number,
): number {
  const value = heap[start]
  let k = start
  let j = k << 1
  while (j <= heapLength) {
    if (j < heapLength && smaller(tree, heap[j + 1], heap[j], depth)) j++
    if (smaller(tree, value, heap[j], depth)) break
    heap[k] = heap[j]
    k = j
    j <<= 1
  }
  heap[k] = value
  return heapLength
}

function smaller(
  tree: Array<{ freq: number, dad: number, len: number }>,
  left: number,
  right: number,
  depth: number[],
): boolean {
  return tree[left].freq < tree[right].freq
    || (tree[left].freq === tree[right].freq && depth[left] <= depth[right])
}

function generateZlibBitLengths(
  tree: Array<{ freq: number, dad: number, len: number }>,
  heap: number[],
  bitLengthCounts: number[],
  heapMax: number,
  heapCapacity: number,
  maxCode: number,
  maxLength: number,
) {
  let overflow = 0
  bitLengthCounts.fill(0)

  tree[heap[heapMax]].len = 0
  for (let h = heapMax + 1; h < heapCapacity; h++) {
    const n = heap[h]
    let bits = tree[tree[n].dad].len + 1
    if (bits > maxLength) {
      bits = maxLength
      overflow++
    }
    tree[n].len = bits
    if (n > maxCode) continue
    bitLengthCounts[bits]++
  }

  if (overflow === 0) return

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
      tree[m].len = bits
      count--
    }
  }
}

function writeCode(writer: BitWriter, codes: HuffmanCodeMap, symbol: number) {
  const code = codes[symbol]
  if (code === undefined) throw new Error(`missing Huffman code for symbol ${symbol}`)
  writer.writeBits(code.code, code.length)
}

function writeTokenBody(
  writer: BitWriter,
  parsed: ParsedTokens,
  block: ParsedBlock,
  literalLengthCodes: HuffmanCodeMap,
  distanceCodes: HuffmanCodeMap,
) {
  for (let i = block.tokenStart; i < block.tokenEnd; i++) {
    if (parsed.kinds[i] === 0) {
      writeCode(writer, literalLengthCodes, parsed.values[i])
    } else {
      const lengthCode = lengthSymbol(parsed.values[i])
      writeCode(writer, literalLengthCodes, lengthCode.symbol)
      if (lengthCode.extraBits !== 0) writer.writeBits(lengthCode.extraValue, lengthCode.extraBits)

      const distanceCode = distanceSymbol(parsed.distances[i])
      writeCode(writer, distanceCodes, distanceCode.symbol)
      if (distanceCode.extraBits !== 0) writer.writeBits(distanceCode.extraValue, distanceCode.extraBits)
    }
  }

  writeCode(writer, literalLengthCodes, END_BLOCK)
}

function lengthSymbol(length: number): { symbol: number, extraBits: number, extraValue: number } {
  if (length === MAX_MATCH) {
    return { symbol: 285, extraBits: 0, extraValue: 0 }
  }
  for (let i = 0; i < LENGTH_BASE.length; i++) {
    const extraBits = LENGTH_EXTRA[i]
    const span = 1 << extraBits
    if (length >= LENGTH_BASE[i] && length < LENGTH_BASE[i] + span) {
      return {
        symbol: 257 + i,
        extraBits,
        extraValue: length - LENGTH_BASE[i],
      }
    }
  }
  throw new Error(`invalid match length ${length}`)
}

function distanceSymbol(distance: number): { symbol: number, extraBits: number, extraValue: number } {
  for (let i = 0; i < DIST_BASE.length; i++) {
    const extraBits = DIST_EXTRA[i]
    const span = 1 << extraBits
    if (distance >= DIST_BASE[i] && distance < DIST_BASE[i] + span) {
      return {
        symbol: i,
        extraBits,
        extraValue: distance - DIST_BASE[i],
      }
    }
  }
  throw new Error(`invalid match distance ${distance}`)
}

function insertString(
  raw: Uint8Array,
  head: Int32Array,
  previous: Int32Array,
  position: number,
  insertHash: number,
): [number, number] {
  const nextHash = updateHash(insertHash, raw[position + MIN_MATCH - 1])
  const matchHead = head[nextHash]
  previous[position] = matchHead
  head[nextHash] = position
  return [nextHash, matchHead]
}

function longestMatch(
  raw: Uint8Array,
  previous: Int32Array,
  strstart: number,
  currentMatch: number,
  previousLength: number,
  lookahead: number,
): { length: number, start: number } {
  let chainLength = MAX_CHAIN_LENGTH
  let bestLength = previousLength
  let bestStart = 0
  const niceMatch = Math.min(NICE_MATCH, lookahead)
  const limit = strstart > MAX_DIST ? strstart - MAX_DIST : 0
  if (previousLength >= GOOD_MATCH) chainLength >>= 2

  const scan0 = raw[strstart]
  const scan1 = raw[strstart + 1]
  let scanEnd1 = raw[strstart + bestLength - 1]
  let scanEnd = raw[strstart + bestLength]
  let match = currentMatch

  while (match > limit && chainLength !== 0) {
    if (
      raw[match + bestLength] === scanEnd
      && raw[match + bestLength - 1] === scanEnd1
      && raw[match] === scan0
      && raw[match + 1] === scan1
    ) {
      let length = 2
      const maxLength = Math.min(MAX_MATCH, lookahead)
      while (length < maxLength && raw[match + length] === raw[strstart + length]) {
        length++
      }

      if (length > bestLength) {
        bestLength = length
        bestStart = match
        if (length >= niceMatch) break
        scanEnd1 = raw[strstart + bestLength - 1]
        scanEnd = raw[strstart + bestLength]
      }
    }

    match = previous[match]
    chainLength--
  }

  return { length: Math.min(bestLength, lookahead), start: bestStart }
}

function buildHuffmanTable(lengths: number[]): HuffmanTable {
  const maxBits = Math.max(...lengths)
  const bitLengthCounts = Array<number>(maxBits + 1).fill(0)
  for (const length of lengths) {
    if (length !== 0) bitLengthCounts[length]++
  }

  let code = 0
  const nextCode = Array<number>(maxBits + 1).fill(0)
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + bitLengthCounts[bits - 1]) << 1
    nextCode[bits] = code
  }

  const symbolsByKey = new Map<number, number>()
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol]
    if (length === 0) continue
    const canonicalCode = nextCode[length]
    nextCode[length]++
    symbolsByKey.set((length << 16) | reverseBits(canonicalCode, length), symbol)
  }
  return { maxBits, symbolsByKey }
}

function buildHuffmanCodeMap(lengths: number[]): HuffmanCodeMap {
  const maxBits = Math.max(...lengths)
  const bitLengthCounts = Array<number>(maxBits + 1).fill(0)
  for (const length of lengths) {
    if (length !== 0) bitLengthCounts[length]++
  }

  let code = 0
  const nextCode = Array<number>(maxBits + 1).fill(0)
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + bitLengthCounts[bits - 1]) << 1
    nextCode[bits] = code
  }

  const codes: HuffmanCodeMap = []
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol]
    if (length === 0) continue
    codes[symbol] = {
      code: reverseBits(nextCode[length], length),
      length,
    }
    nextCode[length]++
  }
  return codes
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  let code = 0
  for (let length = 1; length <= table.maxBits; length++) {
    code |= reader.readBits(1) << (length - 1)
    const symbol = table.symbolsByKey.get((length << 16) | code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('invalid Huffman code')
}

function reverseBits(value: number, length: number): number {
  let reversed = 0
  for (let i = 0; i < length; i++) {
    reversed = (reversed << 1) | (value & 1)
    value >>= 1
  }
  return reversed
}

function updateHash(hash: number, byte: number): number {
  return ((hash << HASH_SHIFT) ^ byte) & HASH_MASK
}

function readPayloadBit(payload: Uint8Array, bit: number): number {
  return (payload[bit >> 3] >> (bit & 7)) & 1
}

function assertExpectedToken(
  expected: ParsedTokens,
  index: number,
  position: number,
  kind: number,
  value: number,
  distance: number,
) {
  if (
    expected.positions[index] !== position
    || expected.kinds[index] !== kind
    || expected.values[index] !== value
    || expected.distances[index] !== distance
  ) {
    const actualLabel = kind === 0
      ? `literal(${position}, ${value})`
      : `match(${position}, length=${value}, distance=${distance})`
    const expectedLabel = expected.kinds[index] === 0
      ? `literal(${expected.positions[index]}, ${expected.values[index]})`
      : `match(${expected.positions[index]}, length=${expected.values[index]}, distance=${expected.distances[index]})`
    throw new Error(`token ${index} mismatch: ${actualLabel} != ${expectedLabel}`)
  }
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
  ) >>> 0
}

function writeU32BE(value: number): Buffer {
  const out = Buffer.alloc(4)
  out[0] = (value >>> 24) & 0xff
  out[1] = (value >>> 16) & 0xff
  out[2] = (value >>> 8) & 0xff
  out[3] = value & 0xff
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    let c = (crc ^ byte) & 0xff
    for (let bit = 0; bit < 8; bit++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  const base = 65_521
  const nmax = 5_552
  let a = 1
  let b = 0
  let offset = 0
  while (offset < bytes.length) {
    const end = Math.min(offset + nmax, bytes.length)
    while (offset < end) {
      a += bytes[offset]
      b += a
      offset++
    }
    a %= base
    b %= base
  }
  return ((b << 16) | a) >>> 0
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function requireEqual(actual: string | number, expected: string | number, label: string) {
  if (actual !== expected) throw new Error(`${label}: ${actual} != ${expected}`)
}

function requireBufferEqual(actual: Uint8Array, expected: Uint8Array, label: string) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: length ${actual.length} != ${expected.length}`)
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${label}[${i}]: 0x${actual[i].toString(16)} != 0x${expected[i].toString(16)}`)
    }
  }
}

function requireArrayEqual(actual: number[], expected: number[], label: string) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: length ${actual.length} != ${expected.length}`)
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${label}[${i}]: ${actual[i]} != ${expected[i]}`)
    }
  }
}

main()
