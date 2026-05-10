import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PUNKS_DATA_ADDRESS,
  PUNKS_RENDERER_ADDRESS,
  PUNKS_RENDERER_BACKGROUND_DEFAULT,
  PunksDataValidationError,
  createPunksRendererClient,
} from '../dist/index.js'

const SVG = "<svg viewBox='0 0 24 24'></svg>"
const MARKETPLACE_SVG = "<svg viewBox='0 0 24 24' data-market='1'></svg>"
const PNG = '0x89504e47'
const FLATTENED_PNG = '0x123456'
const MARKETPLACE_PNG = '0xabcdef'
const IMAGE = `0x${'11'.repeat(2304)}`
const METADATA = JSON.stringify({
  name: 'CryptoPunk 10',
  description: 'This Punk has 1 attributes.',
  image: `data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`,
  attributes: [{ trait_type: 'Type', value: 'Female' }],
  colors: ['#111111ff'],
})

describe('PunksRendererClient', () => {
  it('reads renderer dependencies and per-Punk render outputs', async () => {
    const sdk = createPunksRendererClient({ publicClient: makeFakePublicClient() })

    assert.equal(sdk.address, PUNKS_RENDERER_ADDRESS)
    assert.equal(await sdk.getDataContract(), PUNKS_DATA_ADDRESS)
    assert.equal(await sdk.getPunksDataAddress(), PUNKS_DATA_ADDRESS)
    assert.equal(
      await sdk.getPunksMarketAddress(),
      '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb',
    )
    assert.equal(
      await sdk.getWrapperAddress(),
      '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6',
    )
    assert.equal(
      await sdk.getC721WrapperAddress(),
      '0x000000000000003607fce1ac9e043a86675c5c2f',
    )

    assert.equal(await sdk.getPunkAttributes(10), 'Female 2, Hoodie')
    assert.equal(await sdk.getMetadataJson(10), METADATA)
    assert.equal((await sdk.getPunkMetadata(10)).name, 'CryptoPunk 10')
    assert.equal(
      await sdk.getTokenURI(10),
      `data:application/json;base64,${Buffer.from(METADATA).toString('base64')}`,
    )
    assert.equal(await sdk.getPunkSvg(10), SVG)
    assert.equal(await sdk.getPunkMarketplaceSvg(10), MARKETPLACE_SVG)
    assert.deepEqual([...await sdk.getPunkPng(10)], [0x89, 0x50, 0x4e, 0x47])
    assert.deepEqual([...await sdk.getPunkPngWithBackground(10, '#638596')], [0x12, 0x34, 0x56])
    assert.deepEqual([...await sdk.getPunkMarketplacePng(10)], [0xab, 0xcd, 0xef])
    assert.equal((await sdk.getPunkImage(10)).length, 2304)
    assert.equal(await sdk.getBackground(10), PUNKS_RENDERER_BACKGROUND_DEFAULT)
  })

  it('uses a configured renderer address for reads', async () => {
    const calls = []
    const address = '0x0000000000000000000000000000000000001234'
    const sdk = createPunksRendererClient({
      publicClient: makeFakePublicClient(calls),
      address,
    })

    await sdk.getPunkSvg(10)

    assert.equal(calls[0].address, address)
  })

  it('validates inputs before starting RPC reads', async () => {
    let reads = 0
    const sdk = createPunksRendererClient({
      publicClient: {
        readContract: async () => {
          reads++
          return SVG
        },
      },
    })

    await assert.rejects(() => sdk.getPunkSvg(10_000), PunksDataValidationError)
    await assert.rejects(() => sdk.getTokenURI(10_000), PunksDataValidationError)
    await assert.rejects(
      () => sdk.getPunkPngWithBackground(0, '0x638596fe'),
      PunksDataValidationError,
    )
    await assert.rejects(
      () => sdk.getPunkPngWithBackground(0, '0xzzzzzzff'),
      PunksDataValidationError,
    )
    await assert.rejects(
      () => sdk.getPunkSvg(0, { blockNumber: 1n, blockTag: 'latest' }),
      PunksDataValidationError,
    )
    await assert.rejects(
      () => sdk.getPunkSvg(0, { blockNumber: -1n }),
      PunksDataValidationError,
    )
    await assert.rejects(
      () => sdk.getPunkSvg(0, { blockTag: 'unsafe' }),
      PunksDataValidationError,
    )
    await assert.rejects(() => sdk.getPunkSvg(0, null), PunksDataValidationError)
    assert.equal(reads, 0)
  })

  it('evicts failed cached reads so transient failures can be retried', async () => {
    let reads = 0
    const sdk = createPunksRendererClient({
      publicClient: {
        readContract: async () => {
          reads++
          if (reads === 1) throw new Error('temporary rpc failure')
          return SVG
        },
      },
    })

    await assert.rejects(() => sdk.getPunkSvg(1), /temporary rpc failure/)
    assert.equal(await sdk.getPunkSvg(1), SVG)
    assert.equal(reads, 2)
  })
})

function makeFakePublicClient(calls = []) {
  return {
    readContract: async (call) => {
      calls.push(call)
      return read(call.functionName, call.args ?? [])
    },
  }
}

function read(functionName, args) {
  switch (functionName) {
    case 'dataContract':
    case 'PUNKS_DATA':
      return PUNKS_DATA_ADDRESS
    case 'PUNKS_MARKET':
      return '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb'
    case 'WRAPPER':
      return '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6'
    case 'C721_WRAPPER':
      return '0x000000000000003607fce1ac9e043a86675c5c2f'
    case 'backgroundOf':
      return PUNKS_RENDERER_BACKGROUND_DEFAULT
    case 'metadataJson':
      return METADATA
    case 'punkAttributes':
      return 'Female 2, Hoodie'
    case 'punkImage':
      return IMAGE
    case 'punkMarketplacePng':
      return MARKETPLACE_PNG
    case 'punkMarketplaceSvg':
      return MARKETPLACE_SVG
    case 'punkPng':
      return args.length === 2 ? FLATTENED_PNG : PNG
    case 'punkSvg':
      return SVG
    case 'tokenURI':
      return `data:application/json;base64,${Buffer.from(METADATA).toString('base64')}`
    default:
      throw new Error(`unhandled read ${functionName}`)
  }
}
