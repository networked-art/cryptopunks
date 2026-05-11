import type { Abi, Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  stashAbi,
  stashFactoryAbi,
} from './abi'
import {
  STASH_FACTORY_ADDRESS,
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

const UINT256_MAX = (1n << 256n) - 1n

export type StashOrder = {
  numberOfUnits: number
  pricePerUnit: bigint
  auction: Address
}

export type StashPunkBid = {
  order: StashOrder
  accountNonce: bigint
  bidNonce: bigint
  expiration: bigint
  root: Hex
}

export type ProcessStashPunkBidInput = {
  bid: StashPunkBid
  punkId: number
  signature: Hex
  proof?: readonly Hex[]
}

export type StashOwnerStatus = {
  owner: Address
  address: Address
  deployed: boolean
}

export type EthTransferPlan = {
  description: string
  request: {
    to: Address
    value: bigint
  }
}

export type StashClientConfig = WalletConfig & {
  address: Address
}

export type StashFactoryClientConfig = WalletConfig & {
  address?: Address
}

export type StashERC721ReceivedInput = {
  operator: Address
  from: Address
  tokenId: bigint | number
  data?: Hex
}

export type StashERC1155ReceivedInput = {
  operator: Address
  from: Address
  tokenId: bigint | number
  amount: bigint | number
  data?: Hex
}

export type StashERC1155BatchReceivedInput = {
  operator: Address
  from: Address
  tokenIds: readonly (bigint | number)[]
  amounts: readonly (bigint | number)[]
  data?: Hex
}

export const stashPunkBidTypedDataTypes = {
  Order: [
    { name: 'numberOfUnits', type: 'uint16' },
    { name: 'pricePerUnit', type: 'uint80' },
    { name: 'auction', type: 'address' },
  ],
  PunkBid: [
    { name: 'order', type: 'Order' },
    { name: 'accountNonce', type: 'uint256' },
    { name: 'bidNonce', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'root', type: 'bytes32' },
  ],
} as const

export function stashPunkBidTypedData(params: {
  stash: Address
  chainId: number
  bid: StashPunkBid
}) {
  return {
    domain: {
      chainId: params.chainId,
      verifyingContract: params.stash,
    },
    types: stashPunkBidTypedDataTypes,
    primaryType: 'PunkBid' as const,
    message: normalizePunkBid(params.bid),
  }
}

export class StashFactoryClient {
  readonly address: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: StashFactoryClientConfig = {}) {
    this.address = config.address ?? STASH_FACTORY_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  currentVersion(): Promise<bigint> {
    return this.read<bigint>('currentVersion')
  }

  implementation(version: bigint | number): Promise<Address> {
    return this.read<Address>('implementations', [normalizeUint256('version', version)])
  }

  implementations(version: bigint | number): Promise<Address> {
    return this.implementation(version)
  }

  stashAddressFor(owner: Address): Promise<Address> {
    return this.read<Address>('stashAddressFor', [owner])
  }

  ownerHasDeployed(owner: Address): Promise<boolean> {
    return this.read<boolean>('ownerHasDeployed', [owner])
  }

  async statusForOwner(owner: Address): Promise<StashOwnerStatus> {
    const [address, deployed] = await Promise.all([
      this.stashAddressFor(owner),
      this.ownerHasDeployed(owner),
    ])
    return { owner, address, deployed }
  }

  isStash(stash: Address): Promise<boolean> {
    return this.read<boolean>('isStash', [stash])
  }

  isAuction(auction: Address): Promise<boolean> {
    return this.read<boolean>('isAuction', [auction])
  }

  stashVerifier(): Promise<Address> {
    return this.read<Address>('stashVerifier')
  }

  owner(): Promise<Address> {
    return this.read<Address>('owner')
  }

  ownershipHandoverExpiresAt(pendingOwner: Address): Promise<bigint> {
    return this.read<bigint>('ownershipHandoverExpiresAt', [pendingOwner])
  }

  rolesOf(user: Address): Promise<bigint> {
    return this.read<bigint>('rolesOf', [user])
  }

  hasAllRoles(user: Address, roles: bigint): Promise<boolean> {
    normalizeUint256('roles', roles)
    return this.read<boolean>('hasAllRoles', [user, roles])
  }

  hasAnyRole(user: Address, roles: bigint): Promise<boolean> {
    normalizeUint256('roles', roles)
    return this.read<boolean>('hasAnyRole', [user, roles])
  }

  prepareDeployStash(owner: Address): ContractWritePlan {
    return this.plan('Deploy CryptoPunks Stash', 'deployStash', [owner])
  }

  deployStash(owner: Address): Promise<TransactionHash> {
    return this.write(this.prepareDeployStash(owner))
  }

  prepareUpgradeStash(): ContractWritePlan {
    return this.plan('Upgrade caller Stash', 'upgradeStash', [])
  }

  upgradeStash(): Promise<TransactionHash> {
    return this.write(this.prepareUpgradeStash())
  }

  prepareAddVersion(implementation: Address): ContractWritePlan {
    return this.plan('Add Stash implementation version', 'addVersion', [implementation])
  }

  addVersion(implementation: Address): Promise<TransactionHash> {
    return this.write(this.prepareAddVersion(implementation))
  }

  prepareSetAuction(params: { auction: Address; enabled: boolean }): ContractWritePlan {
    return this.plan('Set Stash auction allowlist status', 'setAuction', [
      params.auction,
      params.enabled,
    ])
  }

  setAuction(params: { auction: Address; enabled: boolean }): Promise<TransactionHash> {
    return this.write(this.prepareSetAuction(params))
  }

  prepareTransferOwnership(newOwner: Address): ContractWritePlan {
    return this.plan('Transfer StashFactory ownership', 'transferOwnership', [newOwner])
  }

  transferOwnership(newOwner: Address): Promise<TransactionHash> {
    return this.write(this.prepareTransferOwnership(newOwner))
  }

  prepareRenounceOwnership(): ContractWritePlan {
    return this.plan('Renounce StashFactory ownership', 'renounceOwnership', [])
  }

  renounceOwnership(): Promise<TransactionHash> {
    return this.write(this.prepareRenounceOwnership())
  }

  prepareRequestOwnershipHandover(): ContractWritePlan {
    return this.plan('Request StashFactory ownership handover', 'requestOwnershipHandover', [])
  }

  requestOwnershipHandover(): Promise<TransactionHash> {
    return this.write(this.prepareRequestOwnershipHandover())
  }

  prepareCompleteOwnershipHandover(pendingOwner: Address): ContractWritePlan {
    return this.plan('Complete StashFactory ownership handover', 'completeOwnershipHandover', [
      pendingOwner,
    ])
  }

  completeOwnershipHandover(pendingOwner: Address): Promise<TransactionHash> {
    return this.write(this.prepareCompleteOwnershipHandover(pendingOwner))
  }

  prepareCancelOwnershipHandover(): ContractWritePlan {
    return this.plan('Cancel StashFactory ownership handover', 'cancelOwnershipHandover', [])
  }

  cancelOwnershipHandover(): Promise<TransactionHash> {
    return this.write(this.prepareCancelOwnershipHandover())
  }

  prepareGrantRoles(params: { user: Address; roles: bigint }): ContractWritePlan {
    return this.plan('Grant StashFactory roles', 'grantRoles', [
      params.user,
      normalizeUint256('roles', params.roles),
    ])
  }

  grantRoles(params: { user: Address; roles: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareGrantRoles(params))
  }

  prepareRevokeRoles(params: { user: Address; roles: bigint }): ContractWritePlan {
    return this.plan('Revoke StashFactory roles', 'revokeRoles', [
      params.user,
      normalizeUint256('roles', params.roles),
    ])
  }

  revokeRoles(params: { user: Address; roles: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareRevokeRoles(params))
  }

  prepareRenounceRoles(roles: bigint): ContractWritePlan {
    return this.plan('Renounce StashFactory roles', 'renounceRoles', [
      normalizeUint256('roles', roles),
    ])
  }

  renounceRoles(roles: bigint): Promise<TransactionHash> {
    return this.write(this.prepareRenounceRoles(roles))
  }

  private plan(description: string, functionName: string, args: readonly unknown[]): ContractWritePlan {
    return writePlan(this.address, stashFactoryAbi, description, functionName, args)
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return readContract<T>(this.publicClient, this.address, stashFactoryAbi, functionName, args)
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }
}

export class StashClient {
  readonly address: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: StashClientConfig) {
    if (isZeroAddress(config.address)) {
      throw new PunksDataValidationError('Stash address must not be the zero address')
    }
    this.address = config.address
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  owner(): Promise<Address> {
    return this.read<Address>('owner')
  }

  version(): Promise<bigint> {
    return this.read<bigint>('version')
  }

  punkAccountNonce(): Promise<bigint> {
    return this.read<bigint>('punkAccountNonce')
  }

  punkBidNonceUsesRemaining(bidNonce: bigint | number): Promise<bigint> {
    return this.read<bigint>('punkBidNonceUsesRemaining', [normalizeUint256('bidNonce', bidNonce)])
  }

  usedPunkBidNonces(bidNonce: bigint | number): Promise<boolean> {
    return this.read<boolean>('usedPunkBidNonces', [normalizeUint256('bidNonce', bidNonce)])
  }

  orderAt(paymentToken: Address, index: bigint | number): Promise<StashOrder> {
    return this.readOrder('paymentTokenToOrders', [
      paymentToken,
      normalizeUint256('index', index),
    ])
  }

  paymentTokenToOrders(paymentToken: Address, index: bigint | number): Promise<StashOrder> {
    return this.orderAt(paymentToken, index)
  }

  getOrder(auction: Address): Promise<StashOrder> {
    return this.readOrder('getOrder', [auction])
  }

  totalLocked(token: Address = ZERO_ADDRESS): Promise<bigint> {
    return this.read<bigint>('totalLocked', [token])
  }

  availableLiquidity(token: Address = ZERO_ADDRESS): Promise<bigint> {
    return this.read<bigint>('availableLiquidity', [token])
  }

  availableLiquidityWETHAndETH(): Promise<bigint> {
    return this.read<bigint>('availableLiquidityWETHAndETH')
  }

  prepareFundEth(amountWei: bigint): EthTransferPlan {
    assertWei('amountWei', amountWei)
    return {
      description: 'Fund Stash with ETH',
      request: {
        to: this.address,
        value: amountWei,
      },
    }
  }

  fundEth(amountWei: bigint): Promise<TransactionHash> {
    return sendTransaction(this.prepareFundEth(amountWei), this.walletClient, this.account)
  }

  prepareInitialize(owner: Address): ContractWritePlan {
    return this.plan('Initialize Stash', 'initialize', [owner])
  }

  initialize(owner: Address): Promise<TransactionHash> {
    return this.write(this.prepareInitialize(owner))
  }

  preparePlaceOrder(params: {
    pricePerUnit: bigint
    numberOfUnits: number
    valueWei?: bigint
  }): ContractWritePlan {
    assertWei('pricePerUnit', params.pricePerUnit)
    const valueWei = params.valueWei ?? 0n
    assertWei('valueWei', valueWei)
    assertIntegerInRange('numberOfUnits', params.numberOfUnits, 1, 65_535)
    return this.plan('Place Stash order', 'placeOrder', [
      params.pricePerUnit,
      params.numberOfUnits,
    ], valueWei)
  }

  placeOrder(params: {
    pricePerUnit: bigint
    numberOfUnits: number
    valueWei?: bigint
  }): Promise<TransactionHash> {
    return this.write(this.preparePlaceOrder(params))
  }

  prepareProcessOrder(params: { costPerUnit: bigint; numberOfUnits: number }): ContractWritePlan {
    assertWei('costPerUnit', params.costPerUnit)
    assertIntegerInRange('numberOfUnits', params.numberOfUnits, 1, 65_535)
    return this.plan('Process Stash order', 'processOrder', [
      params.costPerUnit,
      params.numberOfUnits,
    ])
  }

  processOrder(params: { costPerUnit: bigint; numberOfUnits: number }): Promise<TransactionHash> {
    return this.write(this.prepareProcessOrder(params))
  }

  prepareProcessPunkBid(input: ProcessStashPunkBidInput): ContractWritePlan {
    validatePunkId(input.punkId)
    return this.plan(`Process Stash bid for CryptoPunk ${input.punkId}`, 'processPunkBid', [
      normalizePunkBid(input.bid),
      BigInt(input.punkId),
      input.signature,
      input.proof ?? [],
    ])
  }

  processPunkBid(input: ProcessStashPunkBidInput): Promise<TransactionHash> {
    return this.write(this.prepareProcessPunkBid(input))
  }

  prepareCancelPunkBid(bidNonce: bigint | number): ContractWritePlan {
    return this.plan('Cancel Stash Punk bid', 'cancelPunkBid', [
      normalizeUint256('bidNonce', bidNonce),
    ])
  }

  cancelPunkBid(bidNonce: bigint | number): Promise<TransactionHash> {
    return this.write(this.prepareCancelPunkBid(bidNonce))
  }

  prepareCancelAllPunkBids(): ContractWritePlan {
    return this.plan('Cancel all Stash Punk bids', 'cancelAllPunkBids', [])
  }

  cancelAllPunkBids(): Promise<TransactionHash> {
    return this.write(this.prepareCancelAllPunkBids())
  }

  prepareWrapPunk(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Wrap CryptoPunk ${punkId} from Stash`, 'wrapPunk', [BigInt(punkId)])
  }

  wrapPunk(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareWrapPunk(punkId))
  }

  prepareWithdraw(params: { token?: Address; amountWei: bigint }): ContractWritePlan {
    assertWei('amountWei', params.amountWei)
    return this.plan('Withdraw Stash funds', 'withdraw', [
      params.token ?? ZERO_ADDRESS,
      params.amountWei,
    ])
  }

  withdraw(params: { token?: Address; amountWei: bigint }): Promise<TransactionHash> {
    return this.write(this.prepareWithdraw(params))
  }

  prepareWithdrawERC721(params: { token: Address; tokenIds: readonly (bigint | number)[] }): ContractWritePlan {
    return this.plan('Withdraw ERC-721 tokens from Stash', 'withdrawERC721', [
      params.token,
      normalizeUint256Array('tokenIds', params.tokenIds),
    ])
  }

  withdrawERC721(params: { token: Address; tokenIds: readonly (bigint | number)[] }): Promise<TransactionHash> {
    return this.write(this.prepareWithdrawERC721(params))
  }

  prepareWithdrawERC1155(params: {
    token: Address
    tokenIds: readonly (bigint | number)[]
    amounts: readonly (bigint | number)[]
  }): ContractWritePlan {
    if (params.tokenIds.length !== params.amounts.length) {
      throw new PunksDataValidationError('tokenIds and amounts must have the same length')
    }
    return this.plan('Withdraw ERC-1155 tokens from Stash', 'withdrawERC1155', [
      params.token,
      normalizeUint256Array('tokenIds', params.tokenIds),
      normalizeUint256Array('amounts', params.amounts),
    ])
  }

  withdrawERC1155(params: {
    token: Address
    tokenIds: readonly (bigint | number)[]
    amounts: readonly (bigint | number)[]
  }): Promise<TransactionHash> {
    return this.write(this.prepareWithdrawERC1155(params))
  }

  prepareWithdrawPunks(punkIds: readonly number[]): ContractWritePlan {
    return this.plan('Withdraw CryptoPunks from Stash', 'withdrawPunks', [
      normalizePunkIds(punkIds).map(BigInt),
    ])
  }

  withdrawPunks(punkIds: readonly number[]): Promise<TransactionHash> {
    return this.write(this.prepareWithdrawPunks(punkIds))
  }

  prepareOnERC721Received(input: StashERC721ReceivedInput): ContractWritePlan {
    return this.plan('Handle ERC-721 token receipt', 'onERC721Received', [
      input.operator,
      input.from,
      normalizeUint256('tokenId', input.tokenId),
      input.data ?? '0x',
    ])
  }

  onERC721Received(input: StashERC721ReceivedInput): Promise<TransactionHash> {
    return this.write(this.prepareOnERC721Received(input))
  }

  prepareOnERC1155Received(input: StashERC1155ReceivedInput): ContractWritePlan {
    return this.plan('Handle ERC-1155 token receipt', 'onERC1155Received', [
      input.operator,
      input.from,
      normalizeUint256('tokenId', input.tokenId),
      normalizeUint256('amount', input.amount),
      input.data ?? '0x',
    ])
  }

  onERC1155Received(input: StashERC1155ReceivedInput): Promise<TransactionHash> {
    return this.write(this.prepareOnERC1155Received(input))
  }

  prepareOnERC1155BatchReceived(input: StashERC1155BatchReceivedInput): ContractWritePlan {
    if (input.tokenIds.length !== input.amounts.length) {
      throw new PunksDataValidationError('tokenIds and amounts must have the same length')
    }
    return this.plan('Handle ERC-1155 batch token receipt', 'onERC1155BatchReceived', [
      input.operator,
      input.from,
      normalizeUint256Array('tokenIds', input.tokenIds),
      normalizeUint256Array('amounts', input.amounts),
      input.data ?? '0x',
    ])
  }

  onERC1155BatchReceived(input: StashERC1155BatchReceivedInput): Promise<TransactionHash> {
    return this.write(this.prepareOnERC1155BatchReceived(input))
  }

  typedDataForPunkBid(params: { chainId: number; bid: StashPunkBid }) {
    return stashPunkBidTypedData({
      stash: this.address,
      chainId: params.chainId,
      bid: params.bid,
    })
  }

  async signPunkBid(params: { chainId: number; bid: StashPunkBid }): Promise<Hex> {
    if (!this.walletClient) throw new PunksDataValidationError('walletClient is required for signing')
    const resolvedAccount = this.account ?? this.walletClient.account?.address
    if (!resolvedAccount) throw new PunksDataValidationError('account is required for signing')
    const typedData = this.typedDataForPunkBid(params)
    return (this.walletClient.signTypedData as unknown as (value: typeof typedData & { account: Address }) => Promise<Hex>)({
      ...typedData,
      account: resolvedAccount,
    })
  }

  private plan(
    description: string,
    functionName: string,
    args: readonly unknown[],
    value?: bigint,
  ): ContractWritePlan {
    return writePlan(this.address, stashAbi, description, functionName, args, value)
  }

  private async readOrder(functionName: string, args: readonly unknown[]): Promise<StashOrder> {
    return normalizeOrder(await this.read<unknown>(functionName, args))
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return readContract<T>(this.publicClient, this.address, stashAbi, functionName, args)
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    return writeContract(plan, this.walletClient, this.account)
  }
}

export type PunksStashConfig = WalletConfig & {
  factoryAddress?: Address
  stashAddress?: Address
}

export class PunksStashFacade {
  readonly factory: StashFactoryClient
  readonly current?: StashClient
  private readonly config: PunksStashConfig

  constructor(config: PunksStashConfig = {}) {
    this.config = config
    this.factory = new StashFactoryClient({
      publicClient: config.publicClient,
      walletClient: config.walletClient,
      account: config.account,
      address: config.factoryAddress,
    })
    this.current = config.stashAddress
      ? this.at(config.stashAddress)
      : undefined
  }

  at(address: Address): StashClient {
    return new StashClient({
      publicClient: this.config.publicClient,
      walletClient: this.config.walletClient,
      account: this.config.account,
      address,
    })
  }

  async forOwner(owner: Address): Promise<StashClient> {
    const status = await this.statusForOwner(owner)
    if (!status.deployed || isZeroAddress(status.address)) {
      throw new PunksDataValidationError('Stash is not deployed for owner; deploy a Stash first')
    }
    return this.at(status.address)
  }

  statusForOwner(owner: Address): Promise<StashOwnerStatus> {
    return this.factory.statusForOwner(owner)
  }

  prepareDeploy(owner: Address): ContractWritePlan {
    return this.factory.prepareDeployStash(owner)
  }

  deploy(owner: Address): Promise<TransactionHash> {
    return this.factory.deployStash(owner)
  }
}

export function createStashFactoryClient(config: StashFactoryClientConfig = {}): StashFactoryClient {
  return new StashFactoryClient(config)
}

export function createStashClient(config: StashClientConfig): StashClient {
  return new StashClient(config)
}

function writePlan(
  address: Address,
  abi: Abi,
  description: string,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): ContractWritePlan {
  return {
    description,
    request: {
      address,
      abi,
      functionName,
      args,
      ...(value === undefined ? {} : { value }),
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

async function sendTransaction(
  plan: EthTransferPlan,
  walletClient: WalletClient | undefined,
  account: Address | undefined,
): Promise<TransactionHash> {
  if (!walletClient) throw new PunksDataValidationError('walletClient is required for writes')
  const resolvedAccount = account ?? walletClient.account?.address
  const request = resolvedAccount === undefined
    ? plan.request
    : { ...plan.request, account: resolvedAccount }
  return (walletClient.sendTransaction as unknown as (value: typeof request) => Promise<TransactionHash>)(
    request,
  )
}

function normalizePunkBid(bid: StashPunkBid): StashPunkBid {
  assertIntegerInRange('numberOfUnits', bid.order.numberOfUnits, 1, 65_535)
  assertWei('pricePerUnit', bid.order.pricePerUnit)
  return {
    order: {
      numberOfUnits: bid.order.numberOfUnits,
      pricePerUnit: bid.order.pricePerUnit,
      auction: bid.order.auction,
    },
    accountNonce: normalizeUint256('accountNonce', bid.accountNonce),
    bidNonce: normalizeUint256('bidNonce', bid.bidNonce),
    expiration: normalizeUint256('expiration', bid.expiration),
    root: bid.root,
  }
}

function normalizeOrder(value: unknown): StashOrder {
  if (Array.isArray(value)) {
    const [numberOfUnits, pricePerUnit, auction] = value
    if (typeof auction !== 'string') throw new PunksDataValidationError('invalid Stash order')
    return {
      numberOfUnits: Number(numberOfUnits),
      pricePerUnit: BigInt(pricePerUnit),
      auction: auction as Address,
    }
  }
  if (typeof value === 'object' && value !== null) {
    const order = value as Record<string, unknown>
    if (typeof order.auction !== 'string') throw new PunksDataValidationError('invalid Stash order')
    return {
      numberOfUnits: Number(order.numberOfUnits),
      pricePerUnit: BigInt(order.pricePerUnit as bigint | number | string),
      auction: order.auction as Address,
    }
  }
  throw new PunksDataValidationError('invalid Stash order')
}

function normalizePunkIds(punkIds: readonly number[]): number[] {
  if (punkIds.length === 0) throw new PunksDataValidationError('punkIds must not be empty')
  return punkIds.map((punkId) => {
    validatePunkId(punkId)
    return punkId
  })
}

function assertWei(label: string, value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new PunksDataValidationError(`${label} must be a non-negative bigint`)
  }
}

function normalizeUint256(label: string, value: bigint | number): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new PunksDataValidationError(`${label} must be a safe integer or bigint`)
  }
  if (typeof value !== 'bigint' && typeof value !== 'number') {
    throw new PunksDataValidationError(`${label} must be a safe integer or bigint`)
  }
  const normalized = BigInt(value)
  if (normalized < 0n || normalized > UINT256_MAX) {
    throw new PunksDataValidationError(`${label} must be an unsigned 256-bit integer`)
  }
  return normalized
}

function normalizeUint256Array(
  label: string,
  values: readonly (bigint | number)[],
): bigint[] {
  return values.map((value, index) => normalizeUint256(`${label}[${index}]`, value))
}

function isZeroAddress(address: Address): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}
