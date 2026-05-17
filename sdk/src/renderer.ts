import type { Address, Hex, PublicClient } from 'viem'
import { punksRendererReadAbi } from './abi'
import {
  PIXELS_PER_PUNK,
  PUNK_COUNT,
  PUNKS_RENDERER_ADDRESS,
} from './constants'
import type {
  PunkMetadata,
  PunksDataBlockTag,
  PunksRendererClientConfig,
  PunksRendererReadOptions,
} from './types'
import {
  PunksDataValidationError,
  assertIntegerInRange,
  hexToBytes,
  normalizeRgbaHex,
  rgbaHexToParts,
  validatePunkId,
} from './utils'

type ReadFunctionName = Extract<
  (typeof punksRendererReadAbi)[number],
  { type: 'function' }
>['name']

type Cacheable<T> = Promise<T>

const READ_BLOCK_TAGS = new Set<PunksDataBlockTag>([
  'latest',
  'earliest',
  'pending',
  'safe',
  'finalized',
])

export class PunksRendererClient {
  readonly publicClient: PublicClient
  readonly address: Address

  private readonly cacheEnabled: boolean
  private readonly cache = new Map<string, Cacheable<unknown>>()

  constructor(config: PunksRendererClientConfig) {
    this.publicClient = config.publicClient
    this.address = config.address ?? PUNKS_RENDERER_ADDRESS
    this.cacheEnabled = config.cache ?? true
  }

  clearCache(): void {
    this.cache.clear()
  }

  async getDataContract(options?: PunksRendererReadOptions): Promise<Address> {
    return this.cached('dataContract', options, () =>
      this.read<Address>('dataContract', [], options),
    )
  }

  async getPunksDataAddress(
    options?: PunksRendererReadOptions,
  ): Promise<Address> {
    return this.cached('PUNKS_DATA', options, () =>
      this.read<Address>('PUNKS_DATA', [], options),
    )
  }

  async getPunksMarketAddress(
    options?: PunksRendererReadOptions,
  ): Promise<Address> {
    return this.cached('PUNKS_MARKET', options, () =>
      this.read<Address>('PUNKS_MARKET', [], options),
    )
  }

  async getWrapperAddress(
    options?: PunksRendererReadOptions,
  ): Promise<Address> {
    return this.cached('WRAPPER', options, () =>
      this.read<Address>('WRAPPER', [], options),
    )
  }

  async getC721WrapperAddress(
    options?: PunksRendererReadOptions,
  ): Promise<Address> {
    return this.cached('C721_WRAPPER', options, () =>
      this.read<Address>('C721_WRAPPER', [], options),
    )
  }

  async getPunkAttributes(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<string> {
    validatePunkId(punkId)
    return this.cached(`punkAttributes:${punkId}`, options, () =>
      this.read<string>('punkAttributes', [punkId], options),
    )
  }

  async getMetadataJson(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<string> {
    validatePunkId(punkId)
    return this.cached(`metadataJson:${punkId}`, options, () =>
      this.read<string>('metadataJson', [punkId], options),
    )
  }

  async getPunkMetadata(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<PunkMetadata> {
    return parsePunkMetadata(await this.getMetadataJson(punkId, options))
  }

  async getTokenURI(
    tokenId: number,
    options?: PunksRendererReadOptions,
  ): Promise<string> {
    assertIntegerInRange('tokenId', tokenId, 0, PUNK_COUNT - 1)
    return this.cached(`tokenURI:${tokenId}`, options, () =>
      this.read<string>('tokenURI', [tokenId], options),
    )
  }

  async getPunkImage(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<Uint8Array> {
    validatePunkId(punkId)
    return this.cached(`punkImage:${punkId}`, options, async () => {
      const bytes = hexToBytes(
        await this.read<Hex>('punkImage', [punkId], options),
      )
      if (bytes.length !== PIXELS_PER_PUNK * 4) {
        throw new PunksDataValidationError(
          'punkImage must contain 2304 RGBA bytes',
        )
      }
      return bytes
    })
  }

  async getPunkSvg(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<string> {
    validatePunkId(punkId)
    return this.cached(`punkSvg:${punkId}`, options, () =>
      this.read<string>('punkSvg', [punkId], options),
    )
  }

  async getPunkMarketplaceSvg(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<string> {
    validatePunkId(punkId)
    return this.read<string>('punkMarketplaceSvg', [punkId], options)
  }

  async getPunkPng(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<Uint8Array> {
    validatePunkId(punkId)
    return this.cached(`punkPng:${punkId}`, options, async () =>
      hexToBytes(await this.read<Hex>('punkPng', [punkId], options)),
    )
  }

  async getPunkPngWithBackground(
    punkId: number,
    backgroundRgba: string,
    options?: PunksRendererReadOptions,
  ): Promise<Uint8Array> {
    validatePunkId(punkId)
    const rgba = normalizeOpaqueRgbaHex(backgroundRgba)
    return this.cached(`punkPng:${punkId}:${rgba}`, options, async () =>
      hexToBytes(await this.read<Hex>('punkPng', [punkId, rgba], options)),
    )
  }

  async getPunkMarketplacePng(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<Uint8Array> {
    validatePunkId(punkId)
    return hexToBytes(
      await this.read<Hex>('punkMarketplacePng', [punkId], options),
    )
  }

  async getBackground(
    punkId: number,
    options?: PunksRendererReadOptions,
  ): Promise<Hex> {
    validatePunkId(punkId)
    return this.read<Hex>('backgroundOf', [punkId], options)
  }

  private async read<T>(
    functionName: ReadFunctionName,
    args: readonly unknown[] = [],
    options?: PunksRendererReadOptions,
  ): Promise<T> {
    const params = {
      address: this.address,
      abi: punksRendererReadAbi,
      functionName,
      args,
      ...blockParams(options),
    }
    return (
      this.publicClient.readContract as unknown as (
        value: typeof params,
      ) => Promise<T>
    )(params)
  }

  private cached<T>(
    key: string,
    options: PunksRendererReadOptions | undefined,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = this.getCached<T>(key, options)
    if (cached) return cached
    const promise = load()
    this.setCached(key, options, promise)
    return promise
  }

  private getCached<T>(
    key: string,
    options?: PunksRendererReadOptions,
  ): Promise<T> | undefined {
    if (!this.shouldCache(options)) return undefined
    return this.cache.get(cacheKey(key, options)) as Promise<T> | undefined
  }

  private setCached<T>(
    key: string,
    options: PunksRendererReadOptions | undefined,
    promise: Promise<T>,
  ): void {
    if (!this.shouldCache(options)) return
    const resolvedKey = cacheKey(key, options)
    this.cache.set(resolvedKey, promise)
    promise.catch(() => {
      if (this.cache.get(resolvedKey) === promise)
        this.cache.delete(resolvedKey)
    })
  }

  private shouldCache(options?: PunksRendererReadOptions): boolean {
    return this.cacheEnabled && options?.cache !== false
  }
}

export function createPunksRendererClient(
  config: PunksRendererClientConfig,
): PunksRendererClient {
  return new PunksRendererClient(config)
}

function normalizeOpaqueRgbaHex(value: string): Hex {
  const rgba = normalizeRgbaHex(value)
  if (rgbaHexToParts(rgba).alpha !== 0xff) {
    throw new PunksDataValidationError('backgroundRgba alpha must be 0xff')
  }
  return rgba
}

function parsePunkMetadata(json: string): PunkMetadata {
  try {
    const value = JSON.parse(json) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new PunksDataValidationError(
        'metadataJson must contain a JSON object',
      )
    }
    return value as PunkMetadata
  } catch (error) {
    if (error instanceof PunksDataValidationError) throw error
    throw new PunksDataValidationError('metadataJson must contain valid JSON')
  }
}

function blockParams(options?: PunksRendererReadOptions): {
  blockNumber?: bigint
  blockTag?: PunksRendererReadOptions['blockTag']
} {
  validateReadOptions(options)
  if (options?.blockNumber !== undefined)
    return { blockNumber: options.blockNumber }
  if (options?.blockTag !== undefined) return { blockTag: options.blockTag }
  return {}
}

function cacheKey(key: string, options?: PunksRendererReadOptions): string {
  validateReadOptions(options)
  if (options?.blockNumber !== undefined)
    return `${key}@${options.blockNumber.toString()}`
  if (options?.blockTag !== undefined) return `${key}@${options.blockTag}`
  return `${key}@default`
}

function validateReadOptions(options?: PunksRendererReadOptions): void {
  if (options === undefined) return
  if (typeof options !== 'object' || options === null) {
    throw new PunksDataValidationError('read options must be an object')
  }
  if (options.blockNumber !== undefined && options.blockTag !== undefined) {
    throw new PunksDataValidationError('use blockNumber or blockTag, not both')
  }
  if (options.blockNumber !== undefined) {
    if (typeof options.blockNumber !== 'bigint' || options.blockNumber < 0n) {
      throw new PunksDataValidationError(
        'blockNumber must be a non-negative bigint',
      )
    }
  }
  if (
    options.blockTag !== undefined &&
    !READ_BLOCK_TAGS.has(options.blockTag)
  ) {
    throw new PunksDataValidationError(
      'blockTag must be latest, earliest, pending, safe, or finalized',
    )
  }
}
