import type { Abi, Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  cryptoPunks721Abi,
  cryptoPunksMarketAbi,
  wrappedPunksAbi,
} from './abi'
import {
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_MARKET_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  ZERO_ADDRESS,
} from './constants'
import type {
  ContractWritePlan,
  TransactionHash,
  WalletConfig,
} from './actions'
import {
  PunksDataValidationError,
  assertIntegerInRange,
  validatePunkId,
} from './utils'

export type WrapperClientConfig = WalletConfig & {
  address?: Address
  marketAddress?: Address
}

export type C721WrapFlowInput = {
  owner: Address
  punkId: number
  stash?: Address
}

export type C721BatchWrapFlowInput = {
  owner: Address
  punkIds: readonly number[]
  stash?: Address
}

export type LegacyWrapFlowInput = {
  owner: Address
  punkId: number
  proxy?: Address
}

export class CryptoPunks721Client {
  readonly address: Address
  readonly marketAddress: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: WrapperClientConfig = {}) {
    this.address = config.address ?? CRYPTOPUNKS_721_ADDRESS
    this.marketAddress = config.marketAddress ?? CRYPTOPUNKS_MARKET_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  name(): Promise<string> {
    return this.read<string>('name')
  }

  symbol(): Promise<string> {
    return this.read<string>('symbol')
  }

  licensingTerms(): Promise<string> {
    return this.read<string>('licensingTerms')
  }

  totalSupply(): Promise<bigint> {
    return this.read<bigint>('totalSupply')
  }

  balanceOf(owner: Address): Promise<bigint> {
    return this.read<bigint>('balanceOf', [owner])
  }

  ownerOf(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('ownerOf', [BigInt(punkId)])
  }

  tokenURI(punkId: number): Promise<string> {
    validatePunkId(punkId)
    return this.read<string>('tokenURI', [BigInt(punkId)])
  }

  tokensOfOwner(owner: Address): Promise<bigint[]> {
    return this.read<bigint[]>('tokensOfOwner', [owner])
  }

  punkProxyForUser(user: Address): Promise<Address> {
    return this.read<Address>('punkProxyForUser', [user])
  }

  stashFor(user: Address): Promise<Address> {
    return this.punkProxyForUser(user)
  }

  getApproved(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('getApproved', [BigInt(punkId)])
  }

  isApprovedForAll(owner: Address, operator: Address): Promise<boolean> {
    return this.read<boolean>('isApprovedForAll', [owner, operator])
  }

  supportsInterface(interfaceId: Hex): Promise<boolean> {
    return this.read<boolean>('supportsInterface', [interfaceId])
  }

  async prepareDepositToStash(input: C721WrapFlowInput): Promise<ContractWritePlan> {
    validatePunkId(input.punkId)
    const stash = input.stash ?? await this.stashFor(input.owner)
    return {
      description: `Transfer CryptoPunk ${input.punkId} to Stash`,
      request: {
        address: this.marketAddress,
        abi: cryptoPunksMarketAbi,
        functionName: 'transferPunk',
        args: [stash, BigInt(input.punkId)],
      },
    }
  }

  async prepareWrapFlow(input: C721WrapFlowInput): Promise<ContractWritePlan[]> {
    return [
      await this.prepareDepositToStash(input),
      this.prepareWrapPunk(input.punkId),
    ]
  }

  async prepareBatchWrapFlow(input: C721BatchWrapFlowInput): Promise<ContractWritePlan[]> {
    const punkIds = normalizePunkIds(input.punkIds)
    const stash = input.stash ?? await this.stashFor(input.owner)
    return [
      ...punkIds.map((punkId) => ({
        description: `Transfer CryptoPunk ${punkId} to Stash`,
        request: {
          address: this.marketAddress,
          abi: cryptoPunksMarketAbi,
          functionName: 'transferPunk',
          args: [stash, BigInt(punkId)],
        },
      })),
      this.prepareWrapPunkBatch(punkIds),
    ]
  }

  prepareWrapPunk(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Wrap CryptoPunk ${punkId} as ERC-721`, 'wrapPunk', [BigInt(punkId)])
  }

  prepareWrap(punkId: number): ContractWritePlan {
    return this.prepareWrapPunk(punkId)
  }

  wrapPunk(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareWrapPunk(punkId))
  }

  wrap(punkId: number): Promise<TransactionHash> {
    return this.wrapPunk(punkId)
  }

  prepareWrapPunkBatch(punkIds: readonly number[]): ContractWritePlan {
    return this.plan('Wrap CryptoPunks as ERC-721 tokens', 'wrapPunkBatch', [
      normalizePunkIds(punkIds).map(BigInt),
    ])
  }

  wrapPunkBatch(punkIds: readonly number[]): Promise<TransactionHash> {
    return this.write(this.prepareWrapPunkBatch(punkIds))
  }

  prepareUnwrapPunk(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Unwrap CryptoPunk ${punkId}`, 'unwrapPunk', [BigInt(punkId)])
  }

  prepareUnwrap(punkId: number): ContractWritePlan {
    return this.prepareUnwrapPunk(punkId)
  }

  unwrapPunk(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareUnwrapPunk(punkId))
  }

  unwrap(punkId: number): Promise<TransactionHash> {
    return this.unwrapPunk(punkId)
  }

  prepareUnwrapPunkBatch(punkIds: readonly number[]): ContractWritePlan {
    return this.plan('Unwrap CryptoPunks', 'unwrapPunkBatch', [
      normalizePunkIds(punkIds).map(BigInt),
    ])
  }

  unwrapPunkBatch(punkIds: readonly number[]): Promise<TransactionHash> {
    return this.write(this.prepareUnwrapPunkBatch(punkIds))
  }

  prepareMigrateLegacyWrappedPunks(punkIds: readonly number[]): ContractWritePlan {
    return this.plan('Migrate legacy wrapped CryptoPunks', 'migrateLegacyWrappedPunks', [
      normalizePunkIds(punkIds).map(BigInt),
    ])
  }

  migrateLegacyWrappedPunks(punkIds: readonly number[]): Promise<TransactionHash> {
    return this.write(this.prepareMigrateLegacyWrappedPunks(punkIds))
  }

  prepareRescuePunk(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Rescue unwrapped CryptoPunk ${punkId}`, 'rescuePunk', [BigInt(punkId)])
  }

  rescuePunk(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareRescuePunk(punkId))
  }

  prepareApprove(params: { operator: Address; punkId: number }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(`Approve ERC-721 CryptoPunk ${params.punkId}`, 'approve', [
      params.operator,
      BigInt(params.punkId),
    ])
  }

  approve(params: { operator: Address; punkId: number }): Promise<TransactionHash> {
    return this.write(this.prepareApprove(params))
  }

  prepareSetApprovalForAll(params: { operator: Address; approved: boolean }): ContractWritePlan {
    return this.plan('Set ERC-721 CryptoPunks approval', 'setApprovalForAll', [
      params.operator,
      params.approved,
    ])
  }

  setApprovalForAll(params: { operator: Address; approved: boolean }): Promise<TransactionHash> {
    return this.write(this.prepareSetApprovalForAll(params))
  }

  prepareTransferFrom(params: { from: Address; to: Address; punkId: number }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(`Transfer ERC-721 CryptoPunk ${params.punkId}`, 'transferFrom', [
      params.from,
      params.to,
      BigInt(params.punkId),
    ])
  }

  transferFrom(params: { from: Address; to: Address; punkId: number }): Promise<TransactionHash> {
    return this.write(this.prepareTransferFrom(params))
  }

  prepareSafeTransferFrom(params: {
    from: Address
    to: Address
    punkId: number
    data?: Hex
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    const args = params.data === undefined
      ? [params.from, params.to, BigInt(params.punkId)]
      : [params.from, params.to, BigInt(params.punkId), params.data]
    return this.plan(`Safe transfer ERC-721 CryptoPunk ${params.punkId}`, 'safeTransferFrom', args)
  }

  safeTransferFrom(params: {
    from: Address
    to: Address
    punkId: number
    data?: Hex
  }): Promise<TransactionHash> {
    return this.write(this.prepareSafeTransferFrom(params))
  }

  private plan(description: string, functionName: string, args: readonly unknown[]): ContractWritePlan {
    return writePlan(this.address, cryptoPunks721Abi, description, functionName, args)
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return readContract<T>(this.publicClient, this.address, cryptoPunks721Abi, functionName, args)
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }
}

export class LegacyWrappedPunksClient {
  readonly address: Address
  readonly marketAddress: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: WrapperClientConfig = {}) {
    this.address = config.address ?? WRAPPED_PUNKS_ADDRESS
    this.marketAddress = config.marketAddress ?? CRYPTOPUNKS_MARKET_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  name(): Promise<string> {
    return this.read<string>('name')
  }

  symbol(): Promise<string> {
    return this.read<string>('symbol')
  }

  totalSupply(): Promise<bigint> {
    return this.read<bigint>('totalSupply')
  }

  balanceOf(owner: Address): Promise<bigint> {
    return this.read<bigint>('balanceOf', [owner])
  }

  ownerOf(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('ownerOf', [BigInt(punkId)])
  }

  tokenURI(punkId: number): Promise<string> {
    validatePunkId(punkId)
    return this.read<string>('tokenURI', [BigInt(punkId)])
  }

  baseURI(): Promise<string> {
    return this.read<string>('baseURI')
  }

  tokenByIndex(index: number): Promise<bigint> {
    assertIntegerInRange('index', index, 0, Number.MAX_SAFE_INTEGER)
    return this.read<bigint>('tokenByIndex', [BigInt(index)])
  }

  tokenOfOwnerByIndex(owner: Address, index: number): Promise<bigint> {
    assertIntegerInRange('index', index, 0, Number.MAX_SAFE_INTEGER)
    return this.read<bigint>('tokenOfOwnerByIndex', [owner, BigInt(index)])
  }

  getApproved(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('getApproved', [BigInt(punkId)])
  }

  isApprovedForAll(owner: Address, operator: Address): Promise<boolean> {
    return this.read<boolean>('isApprovedForAll', [owner, operator])
  }

  supportsInterface(interfaceId: Hex): Promise<boolean> {
    return this.read<boolean>('supportsInterface', [interfaceId])
  }

  proxyInfo(user: Address): Promise<Address> {
    return this.read<Address>('proxyInfo', [user])
  }

  proxyFor(user: Address): Promise<Address> {
    return this.proxyInfo(user)
  }

  punkContract(): Promise<Address> {
    return this.read<Address>('punkContract')
  }

  owner(): Promise<Address> {
    return this.read<Address>('owner')
  }

  paused(): Promise<boolean> {
    return this.read<boolean>('paused')
  }

  prepareRegisterProxy(): ContractWritePlan {
    return this.plan('Register legacy wrapped Punk user proxy', 'registerProxy', [])
  }

  registerProxy(): Promise<TransactionHash> {
    return this.write(this.prepareRegisterProxy())
  }

  prepareDepositToProxy(params: { punkId: number; proxy: Address }): ContractWritePlan {
    validatePunkId(params.punkId)
    return {
      description: `Transfer CryptoPunk ${params.punkId} to legacy wrapper proxy`,
      request: {
        address: this.marketAddress,
        abi: cryptoPunksMarketAbi,
        functionName: 'transferPunk',
        args: [params.proxy, BigInt(params.punkId)],
      },
    }
  }

  async prepareWrapFlow(input: LegacyWrapFlowInput): Promise<ContractWritePlan[]> {
    validatePunkId(input.punkId)
    const proxy = input.proxy ?? await this.proxyFor(input.owner)
    if (proxy === ZERO_ADDRESS) {
      throw new PunksDataValidationError('legacy wrapper proxy is not registered; call registerProxy first')
    }
    return [
      this.prepareDepositToProxy({ punkId: input.punkId, proxy }),
      this.prepareMint(input.punkId),
    ]
  }

  prepareMint(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Mint legacy wrapped CryptoPunk ${punkId}`, 'mint', [BigInt(punkId)])
  }

  mint(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareMint(punkId))
  }

  prepareBurn(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Burn legacy wrapped CryptoPunk ${punkId}`, 'burn', [BigInt(punkId)])
  }

  burn(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareBurn(punkId))
  }

  prepareApprove(params: { operator: Address; punkId: number }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(`Approve legacy wrapped CryptoPunk ${params.punkId}`, 'approve', [
      params.operator,
      BigInt(params.punkId),
    ])
  }

  approve(params: { operator: Address; punkId: number }): Promise<TransactionHash> {
    return this.write(this.prepareApprove(params))
  }

  prepareSetApprovalForAll(params: { operator: Address; approved: boolean }): ContractWritePlan {
    return this.plan('Set legacy wrapped Punk approval', 'setApprovalForAll', [
      params.operator,
      params.approved,
    ])
  }

  setApprovalForAll(params: { operator: Address; approved: boolean }): Promise<TransactionHash> {
    return this.write(this.prepareSetApprovalForAll(params))
  }

  prepareTransferFrom(params: { from: Address; to: Address; punkId: number }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(`Transfer legacy wrapped CryptoPunk ${params.punkId}`, 'transferFrom', [
      params.from,
      params.to,
      BigInt(params.punkId),
    ])
  }

  transferFrom(params: { from: Address; to: Address; punkId: number }): Promise<TransactionHash> {
    return this.write(this.prepareTransferFrom(params))
  }

  prepareSafeTransferFrom(params: {
    from: Address
    to: Address
    punkId: number
    data?: Hex
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    const args = params.data === undefined
      ? [params.from, params.to, BigInt(params.punkId)]
      : [params.from, params.to, BigInt(params.punkId), params.data]
    return this.plan(`Safe transfer legacy wrapped CryptoPunk ${params.punkId}`, 'safeTransferFrom', args)
  }

  safeTransferFrom(params: {
    from: Address
    to: Address
    punkId: number
    data?: Hex
  }): Promise<TransactionHash> {
    return this.write(this.prepareSafeTransferFrom(params))
  }

  prepareSetBaseURI(baseUri: string): ContractWritePlan {
    return this.plan('Set legacy wrapped Punks base URI', 'setBaseURI', [baseUri])
  }

  setBaseURI(baseUri: string): Promise<TransactionHash> {
    return this.write(this.prepareSetBaseURI(baseUri))
  }

  preparePause(): ContractWritePlan {
    return this.plan('Pause legacy wrapped Punks', 'pause', [])
  }

  pause(): Promise<TransactionHash> {
    return this.write(this.preparePause())
  }

  prepareUnpause(): ContractWritePlan {
    return this.plan('Unpause legacy wrapped Punks', 'unpause', [])
  }

  unpause(): Promise<TransactionHash> {
    return this.write(this.prepareUnpause())
  }

  prepareTransferOwnership(newOwner: Address): ContractWritePlan {
    return this.plan('Transfer legacy wrapped Punks ownership', 'transferOwnership', [newOwner])
  }

  transferOwnership(newOwner: Address): Promise<TransactionHash> {
    return this.write(this.prepareTransferOwnership(newOwner))
  }

  prepareRenounceOwnership(): ContractWritePlan {
    return this.plan('Renounce legacy wrapped Punks ownership', 'renounceOwnership', [])
  }

  renounceOwnership(): Promise<TransactionHash> {
    return this.write(this.prepareRenounceOwnership())
  }

  private plan(description: string, functionName: string, args: readonly unknown[]): ContractWritePlan {
    return writePlan(this.address, wrappedPunksAbi, description, functionName, args)
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return readContract<T>(this.publicClient, this.address, wrappedPunksAbi, functionName, args)
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }
}

export type PunksWrappersConfig = WalletConfig & {
  c721Address?: Address
  legacyAddress?: Address
  marketAddress?: Address
}

export class PunksWrappersFacade {
  readonly c721: CryptoPunks721Client
  readonly modern: CryptoPunks721Client
  readonly legacy: LegacyWrappedPunksClient

  constructor(config: PunksWrappersConfig = {}) {
    const shared = {
      publicClient: config.publicClient,
      walletClient: config.walletClient,
      account: config.account,
      marketAddress: config.marketAddress,
    }
    this.c721 = new CryptoPunks721Client({ ...shared, address: config.c721Address })
    this.modern = this.c721
    this.legacy = new LegacyWrappedPunksClient({ ...shared, address: config.legacyAddress })
  }
}

export function createCryptoPunks721Client(config: WrapperClientConfig = {}): CryptoPunks721Client {
  return new CryptoPunks721Client(config)
}

export function createLegacyWrappedPunksClient(config: WrapperClientConfig = {}): LegacyWrappedPunksClient {
  return new LegacyWrappedPunksClient(config)
}

function writePlan(
  address: Address,
  abi: Abi,
  description: string,
  functionName: string,
  args: readonly unknown[],
): ContractWritePlan {
  return {
    description,
    request: {
      address,
      abi,
      functionName,
      args,
    },
  }
}

async function readContract<T>(
  publicClient: PublicClient | undefined,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  if (!publicClient) throw new PunksDataValidationError('publicClient is required for reads')
  const request = { address, abi, functionName, args }
  return (publicClient.readContract as unknown as (value: typeof request) => Promise<T>)(request)
}

async function writeContract(
  plan: ContractWritePlan,
  walletClient: WalletClient | undefined,
  account: Address | undefined,
): Promise<TransactionHash> {
  if (!walletClient) throw new PunksDataValidationError('walletClient is required for writes')
  const resolvedAccount = account ?? walletClient.account?.address
  const request = resolvedAccount === undefined
    ? plan.request
    : { ...plan.request, account: resolvedAccount }
  return (walletClient.writeContract as unknown as (value: typeof request) => Promise<TransactionHash>)(
    request,
  )
}

function normalizePunkIds(punkIds: readonly number[]): number[] {
  if (punkIds.length === 0) throw new PunksDataValidationError('punkIds must not be empty')
  return punkIds.map((punkId) => {
    validatePunkId(punkId)
    return punkId
  })
}
