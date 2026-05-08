import { describe, it } from 'node:test'
import { network } from 'hardhat'
import { type Hex } from 'viem'

const TRAIT_COUNT = 111
const PALETTE_SIZE = 222
const PUNK_COUNT = 10_000
const CHUNK_SIZE = 24_575
const BITMAP_WORDS_PER_ROW = 40
const BITMAP_WORD_BYTES = 32
const TRAIT_META_HEADER_SIZE = TRAIT_COUNT * 6
const PIXEL_OFFSET_BYTES = 3
const PIXEL_COUNT_RANGE = 332 - 148 + 1
const COLOR_COUNT_RANGE = 14 - 2 + 1
const SCALAR_WORDS = 2_000

const CANONICAL_SIZES = {
  TraitBitmaps: TRAIT_COUNT * BITMAP_WORDS_PER_ROW * BITMAP_WORD_BYTES,
  TraitMeta: TRAIT_META_HEADER_SIZE,
  Palette: PALETTE_SIZE * 4,
  PixelOffsets: (PUNK_COUNT + 1) * PIXEL_OFFSET_BYTES,
  CompressedPixels: 1,
  ColorBitmaps: PALETTE_SIZE * BITMAP_WORDS_PER_ROW * BITMAP_WORD_BYTES,
  PixelCountBitmaps: PIXEL_COUNT_RANGE * BITMAP_WORDS_PER_ROW * BITMAP_WORD_BYTES,
  ColorCountBitmaps: COLOR_COUNT_RANGE * BITMAP_WORDS_PER_ROW * BITMAP_WORD_BYTES,
} as const

enum BlobId {
  TraitBitmaps,
  TraitMeta,
  Palette,
  PixelOffsets,
  CompressedPixels,
  ColorBitmaps,
  PixelCountBitmaps,
  ColorCountBitmaps,
}

type BlobName = keyof typeof CANONICAL_SIZES

const ZERO_HASH = `0x${'00'.repeat(32)}` as Hex
const NONZERO_HASH = (seed: number): Hex =>
  `0x${seed.toString(16).padStart(2, '0').repeat(32)}` as Hex

function commitment(overrides: Partial<Record<HashField, Hex>> = {}): {
  traitCatalogHash: Hex
  punkMaskHash: Hex
  paletteHash: Hex
  indexedPixelsHash: Hex
  compressedPixelsHash: Hex
} {
  return {
    traitCatalogHash: NONZERO_HASH(0x11),
    punkMaskHash: NONZERO_HASH(0x22),
    paletteHash: NONZERO_HASH(0x33),
    indexedPixelsHash: NONZERO_HASH(0x44),
    compressedPixelsHash: NONZERO_HASH(0x55),
    ...overrides,
  }
}

type HashField =
  | 'traitCatalogHash'
  | 'punkMaskHash'
  | 'paletteHash'
  | 'indexedPixelsHash'
  | 'compressedPixelsHash'

describe('PunksData loader and seal validation', () => {
  describe('loadTraitMaskPairs', () => {
    it('rejects a low-half mask with a bit above TRAIT_COUNT', async () => {
      const { ctx, data } = await deploy()
      const badPair = 1n << BigInt(TRAIT_COUNT) // bit 111 in low half
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadTraitMaskPairs([0, [badPair]]),
        data,
        'InvalidMask',
      )
    })

    it('rejects a high-half mask with a bit above TRAIT_COUNT', async () => {
      const { ctx, data } = await deploy()
      const badPair = 1n << BigInt(128 + TRAIT_COUNT) // bit 111 in high half
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadTraitMaskPairs([0, [badPair]]),
        data,
        'InvalidMask',
      )
    })

    it('rejects a length overrun past PUNK_COUNT / 2 pairs', async () => {
      const { ctx, data } = await deploy()
      const start = PUNK_COUNT / 2 - 1
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadTraitMaskPairs([start, [0n, 0n]]),
        data,
        'InvalidLength',
      )
    })
  })

  describe('loadColorMasks', () => {
    it('rejects a mask with the transparent bit set', async () => {
      const { ctx, data } = await deploy()
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadColorMasks([0, [1n]]),
        data,
        'InvalidMask',
      )
    })

    it('rejects a mask with bits above PALETTE_SIZE', async () => {
      const { ctx, data } = await deploy()
      const bad = 1n << BigInt(PALETTE_SIZE)
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadColorMasks([0, [bad]]),
        data,
        'InvalidMask',
      )
    })

    it('rejects a length overrun past PUNK_COUNT', async () => {
      const { ctx, data } = await deploy()
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadColorMasks([PUNK_COUNT - 1, [0n, 0n]]),
        data,
        'InvalidLength',
      )
    })
  })

  describe('loadPackedScalars', () => {
    it('rejects a length overrun past the scalar word count', async () => {
      const { ctx, data } = await deploy()
      const validWord = packMinimalScalarWord()
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadPackedScalars([SCALAR_WORDS - 1, [validWord, validWord]]),
        data,
        'InvalidLength',
      )
    })
  })

  describe('loadColorSupplies', () => {
    it('rejects a length overrun past PALETTE_SIZE', async () => {
      const { ctx, data } = await deploy()
      await ctx.viem.assertions.revertWithCustomError(
        data.write.loadColorSupplies([PALETTE_SIZE - 1, [0, 0]]),
        data,
        'InvalidLength',
      )
    })
  })

  describe('seal commitment hashes', () => {
    const fields: HashField[] = [
      'traitCatalogHash',
      'punkMaskHash',
      'paletteHash',
      'indexedPixelsHash',
      'compressedPixelsHash',
    ]
    for (const field of fields) {
      it(`rejects a zero ${field}`, async () => {
        const { ctx, data } = await deploy()
        await ctx.viem.assertions.revertWithCustomError(
          data.write.seal([commitment({ [field]: ZERO_HASH })]),
          data,
          'InvalidHash',
        )
      })
    }
  })

  describe('seal dataset shape', () => {
    it('rejects an empty dataset (TraitBitmaps wrong length)', async () => {
      const { ctx, data } = await deploy()
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects TraitBitmaps too long by one byte', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { TraitBitmaps: CANONICAL_SIZES.TraitBitmaps + 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects TraitMeta below the header size', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { TraitMeta: CANONICAL_SIZES.TraitMeta - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects Palette wrong length', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { Palette: CANONICAL_SIZES.Palette - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects PixelOffsets wrong length', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { PixelOffsets: CANONICAL_SIZES.PixelOffsets - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects empty CompressedPixels', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { CompressedPixels: 0 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects ColorBitmaps wrong length', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { ColorBitmaps: CANONICAL_SIZES.ColorBitmaps - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects PixelCountBitmaps wrong length', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { PixelCountBitmaps: CANONICAL_SIZES.PixelCountBitmaps - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('rejects ColorCountBitmaps wrong length', async () => {
      const { ctx, data } = await deploy()
      await loadShape(data, { ColorCountBitmaps: CANONICAL_SIZES.ColorCountBitmaps - 1 })
      await ctx.viem.assertions.revertWithCustomError(
        data.write.seal([commitment()]),
        data,
        'InvalidLength',
      )
    })

    it('accepts a canonical-shape dataset (covers _requireDatasetShape happy path)', async () => {
      const { data } = await deploy()
      await loadShape(data)
      await data.write.seal([commitment()])
      const sealed = (await data.read.isSealed()) as boolean
      if (!sealed) throw new Error('expected sealed')
    })
  })
})

async function deploy() {
  const ctx: any = await network.create()
  const { viem } = ctx
  const [deployer] = await viem.getWalletClients()
  const data = await viem.deployContract('PunksData', [deployer.account.address])
  return { ctx, data }
}

async function loadShape(
  data: any,
  overrides: Partial<Record<BlobName, number>> = {},
) {
  const sizes = { ...CANONICAL_SIZES, ...overrides } as Record<BlobName, number>
  for (const name of Object.keys(CANONICAL_SIZES) as BlobName[]) {
    const size = sizes[name]
    if (size === 0) continue
    const blobId = BlobId[name]
    let remaining = size
    let index = 0
    while (remaining > 0) {
      const chunkSize = Math.min(remaining, CHUNK_SIZE)
      const chunk = `0x${'00'.repeat(chunkSize)}` as Hex
      await data.write.loadBlobChunk([blobId, index, chunk])
      remaining -= chunkSize
      index++
    }
  }
}

function packMinimalScalarWord(): bigint {
  // Five copies of the minimum-valid scalar (pixelCount=148, colorCount=2, rest=0)
  // packed into a single uint256. Field layout matches PunksDataLoader.sol.
  const slot = BigInt(148) | (BigInt(2) << 16n)
  let word = 0n
  for (let i = 0; i < 5; i++) word |= slot << BigInt(i * 48)
  return word
}
