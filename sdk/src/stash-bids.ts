import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { formatEther, getAddress } from 'viem'
import { CRYPTOPUNKS_MARKET_ADDRESS, ZERO_ADDRESS } from './constants'
import type { ContractWritePlan, WalletConfig } from './actions'
import {
  StashClient,
  StashFactoryClient,
  stashPunkBidTypedData,
  type StashPunkBid,
} from './stash'
import type { PunkQuery } from './types'
import { PunksDataset } from './dataset'
import {
  PunksDataSdkError,
  PunksDataValidationError,
  validatePunkId,
} from './utils'

const STASH_BIDS_CHAIN_ID = 1 as const
const STASH_BIDS_DEFAULT_BASE_URL = 'https://bids.cryptopunks.app/api/v1'
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

export type StashBidStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled'

/// Wire shape returned by the Node Foundation bids orderbook at
/// `bids.cryptopunks.app`. Field availability depends on the endpoint: list
/// responses include nonces and (sometimes) cached proofs; single-bid `byId`
/// reads add the signature; per-punk reads include the matching proof.
export type StashBidWire = {
  id: string
  bidder_address: string
  punk_indices: number[]
  bid_amount_wei: string
  bid_amount_eth: number
  merkle_root: string
  account_nonce?: number | string
  bid_nonce?: number | string
  status: string
  signature?: string
  created_at: string
  expires_at?: string | number | null
  tag?: string | null
  proofs?: Record<string, string[]>
}

/// Hydrated bid for SDK consumers. Bigints decoded, addresses checksummed,
/// hex normalized. Proofs are keyed by punk index (number) when present.
export type StashBid = {
  id: string
  bidder: Address
  punkIndices: number[]
  bidAmountWei: bigint
  bidAmountEth: number
  merkleRoot: Hex
  accountNonce?: bigint
  bidNonce?: bigint
  status: StashBidStatus
  signature?: Hex
  createdAt: string
  expiresAt?: string | number | null
  tag?: string | null
  proofs?: Record<number, Hex[]>
}

export type StashBidsListQuery = {
  bidder?: Address
  status?: StashBidStatus
  limit?: number
  chainId?: number
}

export type StashBidsTopQuery = {
  limit?: number
  status?: StashBidStatus
  chainId?: number
}

export type StashBidsForPunkQuery = {
  status?: StashBidStatus
  limit?: number
  chainId?: number
}

export type StashBidsRefreshResult = {
  bidder: Address
  chainId: number
  totalBids: number
  updated: number
  results: Array<{
    bidId: string
    status: string
    reason?: string
    accountNonceValid?: boolean
    bidNonceUsed?: boolean
  }>
}

export type StashBidsApiClientConfig = {
  /// Base URL of the orderbook. Defaults to
  /// `https://bids.cryptopunks.app/api/v1`. Trailing slashes are stripped.
  baseUrl?: string
  /// Optional `fetch` override for tests or non-browser runtimes.
  fetch?: typeof fetch
  /// Optional default request headers.
  headers?: Record<string, string>
}

/// REST client for the Node Foundation bids orderbook. All endpoints are
/// public; mainnet (chainId 1) is the only supported network.
export class StashBidsApiClient {
  readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly headers: Record<string, string>

  constructor(config: StashBidsApiClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? STASH_BIDS_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    )
    this.fetcher = config.fetch ?? globalThis.fetch
    this.headers = config.headers ?? {}
    if (typeof this.fetcher !== 'function') {
      throw new PunksDataValidationError(
        'fetch is not available; pass config.fetch',
      )
    }
  }

  async submit(body: {
    punkIndices: readonly number[]
    bidAmount: string
    address: Address
    signature: Hex
    bidNonce: number
    chainId?: number
    auctionContract?: Address
    stashContract?: Address
    expiresAt?: number | string
    tag?: string
  }): Promise<StashBid> {
    const payload: Record<string, unknown> = {
      punkIndices: [...body.punkIndices],
      bidAmount: body.bidAmount,
      address: body.address,
      signature: body.signature,
      bidNonce: body.bidNonce,
      chainId: body.chainId ?? STASH_BIDS_CHAIN_ID,
    }
    if (body.auctionContract !== undefined)
      payload.auctionContract = body.auctionContract
    if (body.stashContract !== undefined)
      payload.stashContract = body.stashContract
    if (body.expiresAt !== undefined) payload.expiresAt = body.expiresAt
    if (body.tag !== undefined) payload.tag = body.tag
    const json = await this.post<{ data: StashBidWire }>('/bids', payload)
    return parseStashBid(json.data)
  }

  async list(query: StashBidsListQuery = {}): Promise<StashBid[]> {
    return this.getBids('/bids', query)
  }

  async top(query: StashBidsTopQuery = {}): Promise<StashBid[]> {
    return this.getBids('/bids/top', query)
  }

  async all(query: StashBidsTopQuery = {}): Promise<StashBid[]> {
    return this.getBids('/bids/all', query)
  }

  async byId(id: string): Promise<StashBid | null> {
    const res = await this.fetchRaw(`/bids/${encodeURIComponent(id)}`, {
      method: 'GET',
    })
    if (res.status === 404) return null
    if (!res.ok) throw await orderbookError(res, `/bids/${id}`)
    const json = (await res.json()) as { data: StashBidWire }
    return parseStashBid(json.data)
  }

  async forPunk(
    punkId: number,
    query: StashBidsForPunkQuery = {},
  ): Promise<StashBid[]> {
    validatePunkId(punkId)
    return this.getBids(`/bids/punk/${punkId}`, query)
  }

  async proofs(id: string): Promise<Record<number, Hex[]>> {
    const json = await this.get<{ data: Record<string, string[]> }>(
      `/bids/${encodeURIComponent(id)}/proofs`,
    )
    return parseProofs(json.data)
  }

  async refresh(
    bidder: Address,
    chainId: number = STASH_BIDS_CHAIN_ID,
  ): Promise<StashBidsRefreshResult> {
    const json = await this.post<{ data: StashBidsRefreshResult }>(
      '/bids/refresh',
      { bidder, chainId },
    )
    const data = json.data
    return {
      bidder: getAddress(data.bidder),
      chainId: data.chainId,
      totalBids: data.totalBids,
      updated: data.updated,
      results: data.results,
    }
  }

  async merkleRoot(punkIndices: readonly number[]): Promise<Hex> {
    if (punkIndices.length === 0) return ZERO_BYTES32
    const json = await this.post<{ data: { root: string } }>('/merkle/root', {
      punkIndices: [...punkIndices],
    })
    return json.data.root as Hex
  }

  async merkleProof(
    punkIndices: readonly number[],
    targetPunkIndex: number,
  ): Promise<{ root: Hex; proof: Hex[] }> {
    validatePunkId(targetPunkIndex)
    const json = await this.post<{
      data: { root: string; proof: string[] }
    }>('/merkle/proof', {
      punkIndices: [...punkIndices],
      targetPunkIndex,
    })
    return {
      root: json.data.root as Hex,
      proof: json.data.proof.map((p) => p as Hex),
    }
  }

  private async getBids(
    path: string,
    query: Record<string, unknown>,
  ): Promise<StashBid[]> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      params.set(key, String(value))
    }
    const json = await this.get<{ data: StashBidWire[] }>(
      `${path}${params.size > 0 ? `?${params.toString()}` : ''}`,
    )
    return json.data.map(parseStashBid)
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchRaw(path, { method: 'GET' })
    if (!res.ok) throw await orderbookError(res, path)
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchRaw(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await orderbookError(res, path)
    return res.json() as Promise<T>
  }

  private fetchRaw(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    return this.fetcher(url, {
      ...init,
      headers: {
        accept: 'application/json',
        ...this.headers,
        ...(init.headers ?? {}),
      },
    })
  }
}

export type PrepareStashBidInput = {
  /// The bidder's deployed Stash contract — used as the EIP-712 verifying
  /// contract.
  stash: Address
  /// Punks eligible for this bid. Empty (or omitted) = collection bid (any
  /// punk, root = 0x00..00). One id = specific-punk bid. Multiple = a trait
  /// bid or arbitrary specific-ids bid.
  punkIds?: readonly number[]
  /// Wei per matched punk (the contract's `pricePerUnit`).
  pricePerUnit: bigint
  /// Defaults to 1.
  numberOfUnits?: number
  /// Current Stash account nonce; bid is invalidated when this advances.
  accountNonce: bigint | number
  /// Unique per-bidder identifier; used for cancellation.
  bidNonce: bigint | number
  /// Unix timestamp (seconds). Default 0 means no expiration.
  expiration?: bigint | number
  /// Auction / settlement contract. Defaults to the canonical CryptoPunks
  /// market (V̶ ̶1̶ "CryptoPunks").
  auction?: Address
  /// Optional precomputed Merkle root. When omitted, `prepare()` derives it:
  /// `0x00..00` for collection bids, otherwise via the orderbook
  /// `POST /merkle/root` endpoint.
  root?: Hex
}

export type PreparedStashBid = {
  stash: Address
  punkIds: number[]
  bid: StashPunkBid
  typedData: ReturnType<typeof stashPunkBidTypedData>
}

export type SubmitStashBidInput = {
  prepared: PreparedStashBid
  signature: Hex
  /// Bidder EOA. Defaults to the signing account on `walletClient`.
  bidder?: Address
  /// Tag rendered next to the bid in the orderbook UI.
  tag?: string
  /// Unix timestamp in milliseconds (number or numeric string).
  expiresAtMs?: number | string
  /// Stash contract sent to the orderbook. Defaults to `prepared.stash`.
  stashContract?: Address
  /// Override the canonical market address sent to the orderbook. Defaults
  /// to `prepared.bid.order.auction`.
  auctionContract?: Address
}

export type PlaceStashBidInput = PrepareStashBidInput & {
  bidder?: Address
  tag?: string
  expiresAtMs?: number | string
}

export type AcceptStashBidInput = {
  stashAddress: Address
  bid: StashPunkBid
  signature: Hex
  proof: readonly Hex[]
  punkId: number
}

export type PunksStashBidsConfig = WalletConfig & {
  /// Override the orderbook base URL (defaults to the Node Foundation host).
  baseUrl?: string
  /// Pre-built API client. When set, `baseUrl`, `fetch`, and `headers` are
  /// ignored.
  api?: StashBidsApiClient
  /// Override the StashFactory used by `prepareAccept` to resolve a bidder's
  /// Stash address.
  factory?: StashFactoryClient
  /// Optional dataset for `slot()` query → punk indices compilation. When
  /// omitted, the bundled dataset is used lazily.
  dataset?: PunksDataset
  /// Optional `fetch` override forwarded to the default `StashBidsApiClient`.
  fetch?: typeof fetch
  /// Optional default headers forwarded to the default `StashBidsApiClient`.
  headers?: Record<string, string>
}

/// High-level facade for placing, listing, and settling Node Foundation
/// offchain bids. The verifying contract is always a Stash; the auction is
/// always the canonical CryptoPunks market.
export class PunksStashBidsFacade {
  readonly api: StashBidsApiClient
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address
  private readonly factory: StashFactoryClient
  private datasetInstance?: PunksDataset
  private datasetSeed?: PunksDataset

  constructor(config: PunksStashBidsConfig = {}) {
    this.api =
      config.api ??
      new StashBidsApiClient({
        baseUrl: config.baseUrl,
        fetch: config.fetch,
        headers: config.headers,
      })
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
    this.factory =
      config.factory ??
      new StashFactoryClient({
        publicClient: config.publicClient,
        walletClient: config.walletClient,
        account: config.account,
      })
    this.datasetSeed = config.dataset
  }

  /// Compile a `PunkQuery` (the same search shape used by `punks.search`)
  /// into the `number[]` of punk indices to embed in a trait/specific bid.
  slot(query: PunkQuery): number[] {
    return this.dataset().search(query)
  }

  /// Build the typed-data payload for a bid. For non-collection bids, this
  /// calls the orderbook `/merkle/root` endpoint unless `input.root` is
  /// supplied. No signature is produced here.
  async prepare(input: PrepareStashBidInput): Promise<PreparedStashBid> {
    if (!input.stash || isZeroAddress(input.stash)) {
      throw new PunksDataValidationError('stash address is required')
    }
    if (typeof input.pricePerUnit !== 'bigint' || input.pricePerUnit < 0n) {
      throw new PunksDataValidationError(
        'pricePerUnit must be a non-negative bigint',
      )
    }
    const punkIds = (input.punkIds ?? []).map((id) => {
      validatePunkId(id)
      return id
    })
    const numberOfUnits = input.numberOfUnits ?? 1
    const auction = input.auction ?? CRYPTOPUNKS_MARKET_ADDRESS
    const root =
      input.root ??
      (punkIds.length === 0
        ? ZERO_BYTES32
        : await this.api.merkleRoot(punkIds))
    const bid: StashPunkBid = {
      order: {
        numberOfUnits,
        pricePerUnit: input.pricePerUnit,
        auction,
      },
      accountNonce: BigInt(input.accountNonce),
      bidNonce: BigInt(input.bidNonce),
      expiration: BigInt(input.expiration ?? 0),
      root,
    }
    const typedData = stashPunkBidTypedData({ stash: input.stash, bid })
    return { stash: input.stash, punkIds, bid, typedData }
  }

  /// Sign a prepared bid with the configured wallet client.
  async sign(prepared: PreparedStashBid): Promise<Hex> {
    if (!this.walletClient)
      throw new PunksDataValidationError(
        'walletClient is required for signing',
      )
    const resolvedAccount = this.account ?? this.walletClient.account?.address
    if (!resolvedAccount)
      throw new PunksDataValidationError('account is required for signing')
    return (
      this.walletClient.signTypedData as unknown as (
        value: typeof prepared.typedData & { account: Address },
      ) => Promise<Hex>
    )({
      ...prepared.typedData,
      account: resolvedAccount,
    })
  }

  /// POST a signed bid to the orderbook.
  async submit(input: SubmitStashBidInput): Promise<StashBid> {
    const { prepared, signature } = input
    const bidder =
      input.bidder ?? this.account ?? this.walletClient?.account?.address
    if (!bidder)
      throw new PunksDataValidationError(
        'bidder address is required (pass input.bidder or configure a walletClient/account)',
      )
    const totalWei =
      prepared.bid.order.pricePerUnit * BigInt(prepared.bid.order.numberOfUnits)
    return this.api.submit({
      punkIndices: prepared.punkIds,
      bidAmount: formatEther(totalWei),
      address: bidder,
      signature,
      bidNonce: bigIntToNumber('bidNonce', prepared.bid.bidNonce),
      chainId: STASH_BIDS_CHAIN_ID,
      auctionContract: input.auctionContract ?? prepared.bid.order.auction,
      stashContract: input.stashContract ?? prepared.stash,
      expiresAt: input.expiresAtMs,
      tag: input.tag,
    })
  }

  /// One-shot: prepare, sign, and submit. Equivalent to calling `prepare`,
  /// `sign`, and `submit` in sequence.
  async place(input: PlaceStashBidInput): Promise<StashBid> {
    const prepared = await this.prepare(input)
    const signature = await this.sign(prepared)
    return this.submit({
      prepared,
      signature,
      bidder: input.bidder,
      tag: input.tag,
      expiresAtMs: input.expiresAtMs,
    })
  }

  /// Read endpoints (pass-throughs to the API client).
  list(query?: StashBidsListQuery): Promise<StashBid[]> {
    return this.api.list(query)
  }
  top(query?: StashBidsTopQuery): Promise<StashBid[]> {
    return this.api.top(query)
  }
  byId(id: string): Promise<StashBid | null> {
    return this.api.byId(id)
  }
  forPunk(
    punkId: number,
    query?: StashBidsForPunkQuery,
  ): Promise<StashBid[]> {
    return this.api.forPunk(punkId, query)
  }
  proofs(id: string): Promise<Record<number, Hex[]>> {
    return this.api.proofs(id)
  }
  refresh(bidder: Address): Promise<StashBidsRefreshResult> {
    return this.api.refresh(bidder)
  }

  /// Build the `processPunkBid` write that settles a bid through the
  /// seller's Stash. The caller supplies the assembled bid struct, signature,
  /// proof, and target punk — typically pulled from `byId`/`proofs` and the
  /// bidder's known nonces.
  prepareAccept(input: AcceptStashBidInput): ContractWritePlan {
    return new StashClient({
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      account: this.account,
      address: input.stashAddress,
    }).prepareProcessPunkBid({
      bid: input.bid,
      signature: input.signature,
      proof: input.proof,
      punkId: input.punkId,
    })
  }

  /// Cancel a single bid nonce on the bidder's Stash.
  prepareCancel(params: {
    stashAddress: Address
    bidNonce: bigint | number
  }): ContractWritePlan {
    return new StashClient({
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      account: this.account,
      address: params.stashAddress,
    }).prepareCancelPunkBid(params.bidNonce)
  }

  /// Cancel all outstanding bids on the bidder's Stash.
  prepareCancelAll(stashAddress: Address): ContractWritePlan {
    return new StashClient({
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      account: this.account,
      address: stashAddress,
    }).prepareCancelAllPunkBids()
  }

  private dataset(): PunksDataset {
    if (this.datasetInstance) return this.datasetInstance
    this.datasetInstance =
      this.datasetSeed ?? new PunksDataset({ dataset: undefined })
    return this.datasetInstance
  }
}

function parseStashBid(wire: StashBidWire): StashBid {
  return {
    id: wire.id,
    bidder: getAddress(wire.bidder_address),
    punkIndices: [...wire.punk_indices],
    bidAmountWei: BigInt(wire.bid_amount_wei),
    bidAmountEth: wire.bid_amount_eth,
    merkleRoot: wire.merkle_root as Hex,
    accountNonce:
      wire.account_nonce === undefined
        ? undefined
        : BigInt(wire.account_nonce),
    bidNonce:
      wire.bid_nonce === undefined ? undefined : BigInt(wire.bid_nonce),
    status: wire.status as StashBidStatus,
    signature: wire.signature ? (wire.signature as Hex) : undefined,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at ?? null,
    tag: wire.tag ?? null,
    proofs: wire.proofs ? parseProofs(wire.proofs) : undefined,
  }
}

function parseProofs(
  proofs: Record<string, string[]>,
): Record<number, Hex[]> {
  const out: Record<number, Hex[]> = {}
  for (const [key, value] of Object.entries(proofs)) {
    out[Number(key)] = value.map((hash) => hash as Hex)
  }
  return out
}

function bigIntToNumber(label: string, value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PunksDataValidationError(
      `${label} ${value} exceeds Number.MAX_SAFE_INTEGER`,
    )
  }
  return Number(value)
}

function isZeroAddress(address: Address): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}

async function orderbookError(res: Response, path: string): Promise<Error> {
  let body: string
  try {
    body = await res.text()
  } catch {
    body = ''
  }
  return new PunksDataSdkError(
    `Stash bids request failed (${res.status}) at ${path}${
      body ? `: ${body}` : ''
    }`,
  )
}
