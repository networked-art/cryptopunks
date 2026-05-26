import type { Address, PublicClient, WalletClient } from 'viem'
import { punkVaultAbi } from './abi'
import { CRYPTOPUNKS_MARKET_ADDRESS, ZERO_ADDRESS } from './constants'
import type { ContractWritePlan, WalletConfig } from './actions'
import { PunksDataValidationError, validatePunkId } from './utils'

export type PunksVaultClientConfig = WalletConfig & {
  address: Address
  marketAddress?: Address
}

export type PunksVaultConfig = WalletConfig & {
  marketAddress?: Address
}

/**
 * Per-vault client that wraps the `PunksVault`'s delegated market surface —
 * `offerPunkForSale`, `acceptBidForPunk`, etc. — so the EOA controlling the
 * vault can drive native-market actions on vaulted punks without first
 * reclaiming them. Plans target the vault address and the vault forwards to
 * the canonical `CryptoPunksMarket` (or any market passed per-call).
 */
export class PunksVaultClient {
  readonly address: Address
  readonly market: Address
  private readonly publicClient?: PublicClient
  private readonly walletClient?: WalletClient
  private readonly account?: Address

  constructor(config: PunksVaultClientConfig) {
    if (!config.address || config.address === ZERO_ADDRESS) {
      throw new PunksDataValidationError(
        'Vault address must not be the zero address',
      )
    }
    this.address = config.address
    this.market = config.marketAddress ?? CRYPTOPUNKS_MARKET_ADDRESS
    this.publicClient = config.publicClient
    this.walletClient = config.walletClient
    this.account = config.account
  }

  prepareList(params: {
    punkId: number
    priceWei: bigint
    onlySellTo?: Address
    market?: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('priceWei', params.priceWei)
    const market = params.market ?? this.market
    const onlySellTo = params.onlySellTo ?? ZERO_ADDRESS
    const privateListing = onlySellTo !== ZERO_ADDRESS
    return {
      kind: 'list-punk',
      description: privateListing
        ? `List CryptoPunk ${params.punkId} from vault to one buyer`
        : `List CryptoPunk ${params.punkId} from vault`,
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: privateListing
          ? 'offerPunkForSaleToAddress'
          : 'offerPunkForSale',
        args: privateListing
          ? [market, BigInt(params.punkId), params.priceWei, onlySellTo]
          : [market, BigInt(params.punkId), params.priceWei],
      },
    }
  }

  prepareUnlist(params: {
    punkId: number
    market?: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    const market = params.market ?? this.market
    return {
      kind: 'remove-listing',
      description: `Remove CryptoPunk ${params.punkId} listing from vault`,
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: 'punkNoLongerForSale',
        args: [market, BigInt(params.punkId)],
      },
    }
  }

  prepareTransferPunk(params: {
    punkId: number
    to: Address
    market?: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    const market = params.market ?? this.market
    return {
      kind: 'transfer-punk',
      description: `Transfer CryptoPunk ${params.punkId} from vault`,
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: 'transferPunk',
        args: [market, BigInt(params.punkId), params.to],
      },
    }
  }

  prepareAcceptBid(params: {
    punkId: number
    minPriceWei: bigint
    market?: Address
  }): ContractWritePlan {
    validatePunkId(params.punkId)
    assertWei('minPriceWei', params.minPriceWei)
    const market = params.market ?? this.market
    return {
      kind: 'accept-punk-bid',
      description: `Accept bid for CryptoPunk ${params.punkId} from vault`,
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: 'acceptBidForPunk',
        args: [market, BigInt(params.punkId), params.minPriceWei],
      },
    }
  }

  prepareWithdrawFromMarket(params: { market?: Address } = {}): ContractWritePlan {
    const market = params.market ?? this.market
    return {
      kind: 'withdraw-canonical-balance',
      description: 'Withdraw market proceeds to vault',
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: 'withdrawFromMarket',
        args: [market],
      },
    }
  }

  prepareWithdrawFromMarketTo(params: {
    recipient: Address
    market?: Address
  }): ContractWritePlan {
    const market = params.market ?? this.market
    return {
      kind: 'withdraw-canonical-balance',
      description: 'Withdraw market proceeds from vault',
      request: {
        address: this.address,
        abi: punkVaultAbi,
        functionName: 'withdrawFromMarketTo',
        args: [market, params.recipient],
      },
    }
  }
}

export class PunksVaultFacade {
  private readonly config: PunksVaultConfig

  constructor(config: PunksVaultConfig = {}) {
    this.config = config
  }

  at(address: Address): PunksVaultClient {
    return new PunksVaultClient({
      publicClient: this.config.publicClient,
      walletClient: this.config.walletClient,
      account: this.config.account,
      address,
      marketAddress: this.config.marketAddress,
    })
  }
}

export function createPunksVaultClient(
  config: PunksVaultClientConfig,
): PunksVaultClient {
  return new PunksVaultClient(config)
}

function assertWei(label: string, value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new PunksDataValidationError(`${label} must be a non-negative bigint`)
  }
}
