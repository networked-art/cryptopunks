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
    const publicUrl = (runtimeConfig.public as { publicUrl?: string }).publicUrl
    const serverRpcUrl =
      (runtimeConfig as { rpcUrl?: string }).rpcUrl ?? ''
    const toAbsolute = (path: string) =>
      publicUrl ? new URL(path, publicUrl).toString() : path

    // Dev-only `localhost` chain so a browser wallet on the hardhat fork
    // (chainId 31337) can issue writes. Gated on `import.meta.dev` so it
    // never reaches production builds. Both reads still flow through the
    // same `/api/rpc` proxy — what the proxy forwards to is controlled by
    // `NUXT_RPC_URL` in the .env.
    const baseAppChains = appConfig.evm?.chains ?? {}
    const baseRuntimeChains = publicEvm.chains
    const finalAppChains = import.meta.dev
      ? { ...baseAppChains, localhost: { id: 31337 } }
      : baseAppChains
    const finalPublicChains = import.meta.dev
      ? { ...baseRuntimeChains, localhost: { rpcs: '/api/rpc' } }
      : baseRuntimeChains

    // All configured chains route their reads through the same upstream RPC.
    // Server: hit `rpcUrl` directly (Node fetch can't resolve relative URLs
    // and self-roundtripping `/api/rpc` is pointless). Client: hit the
    // same-origin `/api/rpc` proxy (absolute, so viem and walletconnect
    // accept it). Wallet writes are routed by wagmi's connector transport,
    // not by these entries.
    const runtimeChains: Record<string, { rpcs?: string }> = Object.fromEntries(
      Object.entries(finalPublicChains).map(([key, cfg]) => [
        key,
        {
          ...cfg,
          rpcs: import.meta.server
            ? serverRpcUrl
            : toAbsolute(cfg.rpcs ?? ''),
        },
      ]),
    )

    const indexers = publicEvm.ens?.indexers?.split(/\s+/).filter(Boolean) || []

    const { wagmiConfig, evmConfig } = createWagmiConfig({
      title: appConfig.evm?.title || 'EVM Layer',
      appLogoUrl: appConfig.evm?.appLogoUrl,
      defaultChain: appConfig.evm?.defaultChain || 'mainnet',
      chains: finalAppChains,
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
