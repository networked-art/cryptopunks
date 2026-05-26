import { loadBalance } from '@ponder/utils'
import { createConfig } from 'ponder'
import { fallback, http } from 'viem'

import { CryptoPunks721Abi } from './abis/CryptoPunks721Abi'
import { CryptoPunksV1Abi } from './abis/CryptoPunksV1Abi'
import { CryptoPunksV2Abi } from './abis/CryptoPunksV2Abi'
import { PunksMarketAbi } from './abis/PunksMarketAbi'
import { PunksVaultFactoryAbi } from './abis/PunksVaultFactoryAbi'
import { StashFactoryAbi } from './abis/StashFactoryAbi'
import { V1WrapperAbi } from './abis/V1WrapperAbi'
import { WrappedPunksAbi } from './abis/WrappedPunksAbi'
import {
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_721_START_BLOCK,
  CRYPTOPUNKS_V1_ADDRESS,
  CRYPTOPUNKS_V1_START_BLOCK,
  CRYPTOPUNKS_V2_ADDRESS,
  CRYPTOPUNKS_V2_START_BLOCK,
  PUNKS_MARKET_ADDRESS,
  PUNKS_MARKET_START_BLOCK,
  PUNKS_VAULT_FACTORY_ADDRESS,
  PUNKS_VAULT_FACTORY_START_BLOCK,
  STASH_FACTORY_ADDRESS,
  STASH_FACTORY_START_BLOCK,
  V1_WRAPPER_ADDRESS,
  V1_WRAPPER_START_BLOCK,
  WRAPPED_PUNKS_ADDRESS,
  WRAPPED_PUNKS_START_BLOCK,
} from './utils/contracts'

const rpcUrls = (process.env.PONDER_RPC_URLS_1 ?? '').split(' ').filter(Boolean)
const fallbackRpcUrls = (process.env.PONDER_RPC_FALLBACK_URLS_1 ?? '')
  .split(' ')
  .filter(Boolean)
const wsUrl = process.env.PONDER_WS_URL_1 || undefined

const primaryTransport = loadBalance(
  rpcUrls.map((url) => http(url, { timeout: 60_000 })),
)
const rpcTransport = fallbackRpcUrls.length
  ? fallback([
      primaryTransport,
      ...fallbackRpcUrls.map((url) => http(url, { timeout: 60_000 })),
    ])
  : primaryTransport

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: rpcTransport,
      ws: wsUrl,
    },
  },
  contracts: {
    CryptoPunksV1: {
      chain: 'mainnet',
      abi: CryptoPunksV1Abi,
      address: CRYPTOPUNKS_V1_ADDRESS,
      startBlock: CRYPTOPUNKS_V1_START_BLOCK,
    },
    CryptoPunksV2: {
      chain: 'mainnet',
      abi: CryptoPunksV2Abi,
      address: CRYPTOPUNKS_V2_ADDRESS,
      startBlock: CRYPTOPUNKS_V2_START_BLOCK,
    },
    WrappedPunks: {
      chain: 'mainnet',
      abi: WrappedPunksAbi,
      address: WRAPPED_PUNKS_ADDRESS,
      startBlock: WRAPPED_PUNKS_START_BLOCK,
    },
    CryptoPunks721: {
      chain: 'mainnet',
      abi: CryptoPunks721Abi,
      address: CRYPTOPUNKS_721_ADDRESS,
      startBlock: CRYPTOPUNKS_721_START_BLOCK,
    },
    V1Wrapper: {
      chain: 'mainnet',
      abi: V1WrapperAbi,
      address: V1_WRAPPER_ADDRESS,
      startBlock: V1_WRAPPER_START_BLOCK,
    },
    PunksMarket: {
      chain: 'mainnet',
      abi: PunksMarketAbi,
      address: PUNKS_MARKET_ADDRESS,
      startBlock: PUNKS_MARKET_START_BLOCK,
    },
    PunksVaultFactory: {
      chain: 'mainnet',
      abi: PunksVaultFactoryAbi,
      address: PUNKS_VAULT_FACTORY_ADDRESS,
      startBlock: PUNKS_VAULT_FACTORY_START_BLOCK,
    },
    StashFactory: {
      chain: 'mainnet',
      abi: StashFactoryAbi,
      address: STASH_FACTORY_ADDRESS,
      startBlock: STASH_FACTORY_START_BLOCK,
    },
  },
})
