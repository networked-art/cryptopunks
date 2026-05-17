import { VueQueryPlugin } from '@tanstack/vue-query'
import { WagmiPlugin } from '@wagmi/vue'
import { EvmConfigKey } from '@1001-digital/components.evm'
import { createWagmiConfig } from '@1001-digital/layers.evm/app/wagmi'

// Overrides the layer's wagmi plugin so the read RPC URL differs per env:
//  - Server: hit the upstream RPC directly. Node's global fetch can't resolve
//    relative URLs, and routing through our own `/api/rpc` would be a needless
//    self-roundtrip.
//  - Client: use the same-origin `/api/rpc` proxy so the upstream URL — which
//    embeds an API key — never reaches the browser.
//
// Wallet writes go through wagmi's connector transport (the user's wallet),
// never through these read transports.
export default defineNuxtPlugin({
  name: 'wagmi',
  setup(nuxtApp) {
    const appConfig = useAppConfig()
    const runtimeConfig = useRuntimeConfig()
    const publicEvm = runtimeConfig.public.evm as {
      walletConnectProjectId: string
      chains: Record<string, { rpcs?: string }>
      ens?: { indexers?: string }
    }

    const runtimeChains: Record<string, { rpcs?: string }> = import.meta.server
      ? {
          ...publicEvm.chains,
          mainnet: {
            ...publicEvm.chains.mainnet,
            rpcs: (runtimeConfig as { rpcUrl?: string }).rpcUrl ?? '',
          },
        }
      : publicEvm.chains

    const indexers =
      publicEvm.ens?.indexers?.split(/\s+/).filter(Boolean) || []

    const { wagmiConfig, evmConfig } = createWagmiConfig({
      title: appConfig.evm?.title || 'EVM Layer',
      appLogoUrl: appConfig.evm?.appLogoUrl,
      defaultChain: appConfig.evm?.defaultChain || 'mainnet',
      chains: appConfig.evm?.chains || {},
      runtimeChains,
      walletConnectProjectId: publicEvm.walletConnectProjectId || undefined,
      ensMode: appConfig.evm?.ens?.mode || 'indexer',
      ensIndexers: indexers,
      ipfsGateway: appConfig.evm?.ipfsGateway,
      arweaveGateway: appConfig.evm?.arweaveGateway,
      baseURL: nuxtApp.$config.app.baseURL,
      inAppWalletEnabled: appConfig.evm?.inAppWallet?.enabled,
      isClient: import.meta.client,
    })

    nuxtApp.vueApp
      .use(WagmiPlugin, { config: wagmiConfig })
      .use(VueQueryPlugin, {})
      .provide(EvmConfigKey, evmConfig)

    return {
      provide: {
        wagmi: wagmiConfig,
      },
    }
  },
})
