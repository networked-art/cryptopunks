import type { Address, PublicClient } from 'viem'
import { legacyCryptoPunksDataAbi } from './abi'
import { CRYPTOPUNKS_DATA_ADDRESS } from './constants'
import type { PunksDataReadOptions } from './types'
import {
  PunksDataValidationError,
  validatePunkId,
} from './utils'

export type LegacyCryptoPunksDataClientConfig = {
  publicClient?: PublicClient
  address?: Address
}

export class LegacyCryptoPunksDataClient {
  readonly publicClient?: PublicClient
  readonly address: Address

  constructor(config: LegacyCryptoPunksDataClientConfig = {}) {
    this.publicClient = config.publicClient
    this.address = config.address ?? CRYPTOPUNKS_DATA_ADDRESS
  }

  async punkImageSvg(punkId: number, options?: PunksDataReadOptions): Promise<string> {
    validatePunkId(punkId)
    return this.read<string>('punkImageSvg', [punkId], options)
  }

  async punkAttributes(punkId: number, options?: PunksDataReadOptions): Promise<string> {
    validatePunkId(punkId)
    return this.read<string>('punkAttributes', [punkId], options)
  }

  getPunkImageSvg(punkId: number, options?: PunksDataReadOptions): Promise<string> {
    return this.punkImageSvg(punkId, options)
  }

  getPunkAttributes(punkId: number, options?: PunksDataReadOptions): Promise<string> {
    return this.punkAttributes(punkId, options)
  }

  private async read<T>(
    functionName: 'punkImageSvg' | 'punkAttributes',
    args: readonly unknown[],
    options?: PunksDataReadOptions,
  ): Promise<T> {
    if (!this.publicClient) throw new PunksDataValidationError('publicClient is required for reads')
    const params = {
      address: this.address,
      abi: legacyCryptoPunksDataAbi,
      functionName,
      args,
      ...blockParams(options),
    }
    return (this.publicClient.readContract as unknown as (value: typeof params) => Promise<T>)(
      params,
    )
  }
}

export function createLegacyCryptoPunksDataClient(
  config: LegacyCryptoPunksDataClientConfig = {},
): LegacyCryptoPunksDataClient {
  return new LegacyCryptoPunksDataClient(config)
}

function blockParams(options?: PunksDataReadOptions): {
  blockNumber?: bigint
  blockTag?: PunksDataReadOptions['blockTag']
} {
  if (options?.blockNumber !== undefined && options.blockTag !== undefined) {
    throw new PunksDataValidationError('use blockNumber or blockTag, not both')
  }
  if (options?.blockNumber !== undefined) return { blockNumber: options.blockNumber }
  if (options?.blockTag !== undefined) return { blockTag: options.blockTag }
  return {}
}
