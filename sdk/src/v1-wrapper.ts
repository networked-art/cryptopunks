import type { Abi, Address, PublicClient, WalletClient } from 'viem'
import { punksV1WrapperAbi, unwrapV1PunksAbi } from './abi'
import {
  PUNKS_V1_WRAPPER_ADDRESS,
  UNWRAP_V1_PUNKS_ADDRESS,
} from './constants'
import type {
  ContractWritePlan,
  ContractWriteRequest,
  TransactionHash,
  WalletConfig,
} from './actions'
import { PunksDataValidationError, validatePunkId } from './utils'

export type PunksV1WrapperConfig = WalletConfig & {
  address?: Address
  /// Override the batch-unwrap helper address (`UnwrapV1Punks`). The helper
  /// is what makes `unwrapBatch` possible — the wrapper has no native batch.
  unwrapHelperAddress?: Address
}

/// Surface for the third-party `PunksV1Wrapper` ERC-721 at
/// [`PUNKS_V1_WRAPPER_ADDRESS`](./constants.ts), which custodies the broken
/// June 2017 Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ one-to-one. Single-id `wrap` / `unwrap` go straight
/// against the wrapper; `unwrapBatch` (and the matching prepare/flow methods)
/// route through the `UnwrapV1Punks` helper at `UNWRAP_V1_PUNKS_ADDRESS`,
/// which the caller must approve once via `setApprovalForAll`.
export class PunksV1WrapperClient {
  readonly address: Address
  readonly unwrapHelperAddress: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: PunksV1WrapperConfig = {}) {
    this.address = config.address ?? PUNKS_V1_WRAPPER_ADDRESS
    this.unwrapHelperAddress =
      config.unwrapHelperAddress ?? UNWRAP_V1_PUNKS_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  // ─────────────────────────────── Reads ───────────────────────────────

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

  exists(punkId: number): Promise<boolean> {
    validatePunkId(punkId)
    return this.read<boolean>('exists', [BigInt(punkId)])
  }

  getApproved(punkId: number): Promise<Address> {
    validatePunkId(punkId)
    return this.read<Address>('getApproved', [BigInt(punkId)])
  }

  isApprovedForAll(owner: Address, operator: Address): Promise<boolean> {
    return this.read<boolean>('isApprovedForAll', [owner, operator])
  }

  /// Convenience: is the batch-unwrap helper approved as an operator?
  /// Equivalent to `isApprovedForAll(owner, this.unwrapHelperAddress)`.
  isBatchUnwrapApproved(owner: Address): Promise<boolean> {
    return this.isApprovedForAll(owner, this.unwrapHelperAddress)
  }

  /// The underlying V1 CryptoPunks address the wrapper custodies.
  punkAddress(): Promise<Address> {
    return this.read<Address>('punkAddress')
  }

  // ────────────────────────────── Writes ──────────────────────────────

  prepareWrap(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Wrap CryptoPunk ${punkId}`, 'wrap', [BigInt(punkId)])
  }
  wrap(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareWrap(punkId))
  }

  prepareUnwrap(punkId: number): ContractWritePlan {
    validatePunkId(punkId)
    return this.plan(`Unwrap CryptoPunk ${punkId}`, 'unwrap', [BigInt(punkId)])
  }
  unwrap(punkId: number): Promise<TransactionHash> {
    return this.write(this.prepareUnwrap(punkId))
  }

  prepareSetApprovalForAll(params: {
    operator: Address
    approved: boolean
  }): ContractWritePlan {
    return this.plan(
      `${params.approved ? 'Approve' : 'Revoke'} V1 wrapper operator`,
      'setApprovalForAll',
      [params.operator, params.approved],
    )
  }
  setApprovalForAll(params: {
    operator: Address
    approved: boolean
  }): Promise<TransactionHash> {
    return this.write(this.prepareSetApprovalForAll(params))
  }

  prepareApprove(params: {
    to: Address
    punkId: number
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(
      `Approve V1 wrapped CryptoPunk ${params.punkId}`,
      'approve',
      [params.to, BigInt(params.punkId)],
    )
  }
  approve(params: { to: Address; punkId: number }): Promise<TransactionHash> {
    return this.write(this.prepareApprove(params))
  }

  prepareTransferFrom(params: {
    from: Address
    to: Address
    punkId: number
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    return this.plan(
      `Transfer V1 wrapped CryptoPunk ${params.punkId}`,
      'transferFrom',
      [params.from, params.to, BigInt(params.punkId)],
    )
  }
  transferFrom(params: {
    from: Address
    to: Address
    punkId: number
  }): Promise<TransactionHash> {
    return this.write(this.prepareTransferFrom(params))
  }

  // ─────────────────────── Batch unwrap (via helper) ────────────────────

  /// Approves the `UnwrapV1Punks` helper as an operator on the wrapper. This
  /// is a one-time write per holder; once set, every subsequent batch unwrap
  /// is a single transaction.
  prepareApproveBatchUnwrap(): ContractWritePlan {
    return this.prepareSetApprovalForAll({
      operator: this.unwrapHelperAddress,
      approved: true,
    })
  }
  approveBatchUnwrap(): Promise<TransactionHash> {
    return this.write(this.prepareApproveBatchUnwrap())
  }

  /// Plan for the helper's `unwrap(uint16[])`. The caller must already have
  /// `isBatchUnwrapApproved(owner) === true` (use `prepareUnwrapBatchFlow`
  /// to get both writes composed for you).
  prepareUnwrapBatch(punkIds: readonly number[]): ContractWritePlan {
    const ids = normalizeBatchIds(punkIds)
    return {
      description: `Unwrap ${ids.length} CryptoPunks via UnwrapV1Punks helper`,
      request: {
        address: this.unwrapHelperAddress,
        abi: unwrapV1PunksAbi as unknown as Abi,
        functionName: 'unwrap',
        args: [ids],
      },
    }
  }
  unwrapBatch(punkIds: readonly number[]): Promise<TransactionHash> {
    return this.write(this.prepareUnwrapBatch(punkIds))
  }

  /// Returns the ordered write plans needed to unwrap `punkIds` in a batch:
  /// the approval write is omitted when the helper is already approved.
  /// Reads the current approval state, so a `publicClient` is required.
  async prepareUnwrapBatchFlow(input: {
    owner: Address
    punkIds: readonly number[]
  }): Promise<ContractWritePlan[]> {
    const ids = normalizeBatchIds(input.punkIds)
    const approved = await this.isBatchUnwrapApproved(input.owner)
    const unwrapPlan = this.prepareUnwrapBatch(ids)
    return approved ? [unwrapPlan] : [this.prepareApproveBatchUnwrap(), unwrapPlan]
  }

  /// Writes the composed batch flow against the configured wallet.
  async unwrapBatchFlow(input: {
    owner: Address
    punkIds: readonly number[]
  }): Promise<TransactionHash[]> {
    const plans = await this.prepareUnwrapBatchFlow(input)
    const hashes: TransactionHash[] = []
    for (const plan of plans) hashes.push(await this.write(plan))
    return hashes
  }

  // ───────────────────────────── Internals ─────────────────────────────

  private plan(
    description: string,
    functionName: string,
    args: readonly unknown[],
  ): ContractWritePlan {
    return {
      description,
      request: {
        address: this.address,
        abi: punksV1WrapperAbi as unknown as Abi,
        functionName,
        args,
      },
    }
  }

  private async read<T>(
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<T> {
    if (!this.publicClient) {
      throw new PunksDataValidationError('publicClient is required for reads')
    }
    return (
      this.publicClient.readContract as unknown as (
        value: ContractWriteRequest,
      ) => Promise<T>
    )({
      address: this.address,
      abi: punksV1WrapperAbi as unknown as Abi,
      functionName,
      args,
    })
  }

  private write(plan: ContractWritePlan): Promise<TransactionHash> {
    if (!this.walletClient) {
      throw new PunksDataValidationError('walletClient is required for writes')
    }
    const resolvedAccount = this.account ?? this.walletClient.account?.address
    const request =
      resolvedAccount === undefined
        ? plan.request
        : { ...plan.request, account: resolvedAccount }
    return (
      this.walletClient.writeContract as unknown as (
        value: typeof request,
      ) => Promise<TransactionHash>
    )(request)
  }
}

export function createPunksV1WrapperClient(
  config: PunksV1WrapperConfig = {},
): PunksV1WrapperClient {
  return new PunksV1WrapperClient(config)
}

/// `uint16[]` calldata: each id must fit in 16 bits (0–65535). Punk ids are
/// 0–9999 in practice; reject anything else early so the wallet popup carries
/// a useful error.
function normalizeBatchIds(punkIds: readonly number[]): number[] {
  if (punkIds.length === 0) {
    throw new PunksDataValidationError('punkIds must not be empty')
  }
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of punkIds) {
    validatePunkId(raw)
    if (raw > 0xffff) {
      throw new PunksDataValidationError(
        `punkId ${raw} does not fit in uint16`,
      )
    }
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}
