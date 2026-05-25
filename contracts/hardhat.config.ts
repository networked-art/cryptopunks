import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem'
import { configVariable, defineConfig } from 'hardhat/config'

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: '0.8.34',
        settings: {
          evmVersion: 'cancun',
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: '0.8.34',
        settings: {
          evmVersion: 'cancun',
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: 'edr-simulated',
      chainType: 'l1',
      forking: {
        url: configVariable('MAINNET_RPC_URL'),
        blockNumber: 25171056,
      },
    },
    // Used by `pnpm dev:fork` for the long-running JSON-RPC server. Pins
    // chainId to 1 so the local indexer (which expects `chains.mainnet.id = 1`)
    // accepts the fork. Kept separate from `hardhatMainnet` because the
    // `--chain-id` CLI flag is a no-op in hardhat 3.4.5 (dead variable in
    // `node/task-action.js`), and changing `hardhatMainnet` would shift tests.
    hardhatFork: {
      type: 'edr-simulated',
      chainType: 'l1',
      chainId: 1,
      forking: {
        url: configVariable('MAINNET_RPC_URL'),
        blockNumber: 25171056,
      },
    },
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
    },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('SEPOLIA_RPC_URL'),
      accounts: [configVariable('DEPLOYER_1001_PRIVATE_KEY')],
    },
    mainnet: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('MAINNET_RPC_URL'),
      accounts: [configVariable('DEPLOYER_1001_PRIVATE_KEY')],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable('ETHERSCAN_API_KEY'),
    },
  },
})
