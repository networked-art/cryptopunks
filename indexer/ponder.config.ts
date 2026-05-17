import { loadBalance } from '@ponder/utils'
import { createConfig } from 'ponder'
import { fallback, http } from 'viem'

import { ChainlinkAggregatorAbi } from './abis/ChainlinkAggregatorAbi'
import { CryptoPunks721Abi } from './abis/CryptoPunks721Abi'
import { CryptoPunksV1Abi } from './abis/CryptoPunksV1Abi'
import { CryptoPunksV2Abi } from './abis/CryptoPunksV2Abi'
import { WrappedPunksAbi } from './abis/WrappedPunksAbi'
import {
  CHAINLINK_ETH_USD_AGGREGATOR,
  CHAINLINK_ETH_USD_START_BLOCK,
  CRYPTOPUNKS_721_ADDRESS,
  CRYPTOPUNKS_721_START_BLOCK,
  CRYPTOPUNKS_V1_ADDRESS,
  CRYPTOPUNKS_V1_END_BLOCK,
  CRYPTOPUNKS_V1_START_BLOCK,
  CRYPTOPUNKS_V2_ADDRESS,
  CRYPTOPUNKS_V2_START_BLOCK,
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
    // V1 is indexed only for its short canonical window: from launch up to the
    // block before V2 was deployed. From V2 deployment onward V1 is abandoned
    // and we only track V2.
    CryptoPunksV1: {
      chain: 'mainnet',
      abi: CryptoPunksV1Abi,
      address: CRYPTOPUNKS_V1_ADDRESS,
      startBlock: CRYPTOPUNKS_V1_START_BLOCK,
      endBlock: CRYPTOPUNKS_V1_END_BLOCK,
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
    ChainlinkEthUsd: {
      chain: 'mainnet',
      abi: ChainlinkAggregatorAbi,
      address: CHAINLINK_ETH_USD_AGGREGATOR,
      startBlock: CHAINLINK_ETH_USD_START_BLOCK,
    },
  },
})
