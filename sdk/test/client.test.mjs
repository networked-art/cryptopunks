import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PUNKS_DATA_ADDRESS,
  TraitKind,
  bitmapToPunkIds,
  bytesToHex,
  createPunksDataClient,
  emptyPunkBitmap,
  punkBitmapFromIds,
} from '../dist/index.js'

describe('PunksDataClient', () => {
  it('resolves traits, searches through bitmap indexes, and paginates results', async () => {
    const sdk = createPunksDataClient({ publicClient: makeFakePublicClient() })

    await assert.rejects(() => sdk.resolveTraitId('Alien'), /ambiguous/)
    assert.equal(
      await sdk.resolveTraitId({ name: 'Alien', kind: TraitKind.NormalizedType }),
      0,
    )
    assert.equal(await sdk.resolveTraitId({ name: 'Hoodie', kind: 'Accessory' }), 25)

    const ids = await sdk.search({
      traits: { required: [{ name: 'Hoodie', kind: 'Accessory' }] },
      colors: { required: [2] },
      pixelCount: 200,
      colorCount: 4,
    })
    assert.deepEqual(ids, [10])

    const visualWithoutHoodie = await sdk.search({
      traits: { forbidden: [{ name: 'Hoodie', kind: 'Accessory' }] },
      colors: { anyOf: [2, 3] },
    })
    assert.deepEqual(visualWithoutHoodie, [300])

    const paged = await sdk.search(
      { colors: { required: [2] }, offset: 1, limit: 1 },
    )
    assert.deepEqual(paged, [300])

    assert.equal(await sdk.count({ colors: { required: [2] } }), 3)
  })

  it('hydrates punk summaries and expands indexed pixels to RGBA', async () => {
    const sdk = createPunksDataClient({
      publicClient: makeFakePublicClient(),
      address: PUNKS_DATA_ADDRESS,
    })

    const punk = await sdk.getPunk(10, {
      includeTraits: true,
      includeColors: true,
      includePixels: true,
    })

    assert.equal(punk.id, 10)
    assert.deepEqual(punk.traitIds, [0, 25])
    assert.deepEqual(punk.traits.map((trait) => trait.name), ['Alien', 'Hoodie'])
    assert.deepEqual(punk.colorIds, [2])
    assert.equal(punk.colors[0].rgba, '0x111111ff')
    assert.equal(punk.pixelCount, 200)
    assert.equal(punk.colorCount, 4)
    assert.equal(punk.punkTypeName, 'Female')
    assert.equal(punk.headVariantName, 'Female 2')
    assert.equal(punk.indexedPixels.length, 576)

    const rgba = await sdk.getRgbaPixels(10)
    assert.deepEqual([...rgba.slice(0, 4)], [0x11, 0x11, 0x11, 0xff])
  })
})

function makeFakePublicClient() {
  const catalog = makeCatalog()
  const palette = makePaletteBytes()
  const bitmaps = makeBitmaps()
  const traitMasks = new Map([
    [10, (1n << 0n) | (1n << 25n)],
    [300, 1n << 24n],
    [9999, 1n << 25n],
  ])
  const colorMasks = new Map([
    [10, 1n << 2n],
    [300, (1n << 2n) | (1n << 3n)],
    [9999, 1n << 2n],
  ])
  const indexed = new Uint8Array(576)
  indexed[0] = 2

  const read = (functionName, args = []) => {
    switch (functionName) {
      case 'datasetHash':
        return '0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68'
      case 'isSealed':
        return true
      case 'traitCount':
        return 111
      case 'paletteSize':
        return 222
      case 'traitName':
        return catalog[args[0]].name
      case 'traitKind':
        return catalog[args[0]].kind
      case 'traitSupply':
        return catalog[args[0]].supply
      case 'traitBitmapWord':
        return (bitmaps.traits.get(args[0]) ?? emptyPunkBitmap())[args[1]]
      case 'colorBitmapWord':
        return (bitmaps.colors.get(args[0]) ?? emptyPunkBitmap())[args[1]]
      case 'pixelCountBitmapWord':
        return (bitmaps.pixelCounts.get(args[0]) ?? emptyPunkBitmap())[args[1]]
      case 'colorCountBitmapWord':
        return (bitmaps.colorCounts.get(args[0]) ?? emptyPunkBitmap())[args[1]]
      case 'traitMaskOf':
        return traitMasks.get(args[0]) ?? 0n
      case 'colorMaskOf':
        return colorMasks.get(args[0]) ?? 0n
      case 'pixelCountOf':
        return args[0] === 9999 ? 210 : 200
      case 'colorCountOf':
        return args[0] === 300 ? 5 : 4
      case 'attributeCountOf':
        return args[0] === 10 ? 1 : 0
      case 'punkTypeOf':
        return 2
      case 'headVariantOf':
        return 3
      case 'indexedPixelsOf':
        return bytesToHex(indexed)
      case 'paletteRgbaBytes':
        return bytesToHex(palette)
      case 'paletteRgbBytes':
        return bytesToHex(stripAlpha(palette))
      case 'paletteAlphaBytes':
        return bytesToHex(onlyAlpha(palette))
      case 'colorOf': {
        const offset = args[0] * 4
        return bytesToHex(palette.slice(offset, offset + 4))
      }
      case 'colorSupply':
        return args[0] === 2 ? 3 : 0
      case 'hasTrait':
        return ((traitMasks.get(args[0]) ?? 0n) & (1n << BigInt(args[1]))) !== 0n
      case 'hasColor':
        return args[1] !== 0 && ((colorMasks.get(args[0]) ?? 0n) & (1n << BigInt(args[1]))) !== 0n
      case 'hasTraits': {
        const mask = traitMasks.get(args[0]) ?? 0n
        return (mask & args[1]) === args[1] && (mask & args[2]) === 0n && (args[3] === 0n || (mask & args[3]) !== 0n)
      }
      case 'colorAt':
        return args[1] === 0 && args[2] === 0 ? 2 : 0
      default:
        throw new Error(`unhandled read ${functionName}`)
    }
  }

  return {
    readContract: async ({ functionName, args }) => read(functionName, args),
    multicall: async ({ contracts }) =>
      contracts.map(({ functionName, args }) => read(functionName, args)),
  }
}

function makeCatalog() {
  const catalog = Array.from({ length: 111 }, (_, id) => ({
    id,
    name: `Trait ${id}`,
    kind: TraitKind.Accessory,
    supply: 0,
  }))
  catalog[0] = { id: 0, name: 'Alien', kind: TraitKind.NormalizedType, supply: 2 }
  catalog[5] = { id: 5, name: 'Alien', kind: TraitKind.HeadVariant, supply: 1 }
  catalog[24] = { id: 24, name: 'Beanie', kind: TraitKind.Accessory, supply: 2 }
  catalog[25] = { id: 25, name: 'Hoodie', kind: TraitKind.Accessory, supply: 2 }
  return catalog
}

function makePaletteBytes() {
  const palette = new Uint8Array(222 * 4)
  palette.set([0x00, 0x00, 0x00, 0x00], 0)
  palette.set([0xaa, 0xaa, 0xaa, 0xff], 4)
  palette.set([0x11, 0x11, 0x11, 0xff], 8)
  palette.set([0x22, 0x22, 0x22, 0xff], 12)
  return palette
}

function makeBitmaps() {
  return {
    traits: new Map([
      [0, punkBitmapFromIds([0, 10])],
      [5, punkBitmapFromIds([0])],
      [24, punkBitmapFromIds([0, 10, 300])],
      [25, punkBitmapFromIds([10, 9999])],
    ]),
    colors: new Map([
      [2, punkBitmapFromIds([10, 300, 9999])],
      [3, punkBitmapFromIds([300])],
    ]),
    pixelCounts: new Map([
      [200, punkBitmapFromIds([10, 300])],
      [210, punkBitmapFromIds([9999])],
    ]),
    colorCounts: new Map([
      [4, punkBitmapFromIds([10, 9999])],
      [5, punkBitmapFromIds([300])],
    ]),
  }
}

function stripAlpha(rgba) {
  const rgb = new Uint8Array(222 * 3)
  for (let colorId = 0; colorId < 222; colorId++) {
    rgb[colorId * 3] = rgba[colorId * 4]
    rgb[colorId * 3 + 1] = rgba[colorId * 4 + 1]
    rgb[colorId * 3 + 2] = rgba[colorId * 4 + 2]
  }
  return rgb
}

function onlyAlpha(rgba) {
  const alpha = new Uint8Array(222)
  for (let colorId = 0; colorId < 222; colorId++) {
    alpha[colorId] = rgba[colorId * 4 + 3]
  }
  return alpha
}
