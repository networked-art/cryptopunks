import { VueQueryPlugin } from '@tanstack/vue-query'
import { WagmiPlugin } from '@wagmi/vue'
import { EvmConfigKey } from '@1001-digital/components.evm'
import { createWagmiConfig } from '@1001-digital/layers.evm/app/wagmi'
import type { Chain } from 'viem'

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

    // Override each chain's reads to flow through the same upstream RPC.
    // Server: hit `rpcUrl` directly (Node fetch can't resolve relative URLs
    // and self-roundtripping `/api/rpc` is pointless). Client: hit the
    // same-origin `/api/rpc` proxy (absolute, so viem and walletconnect
    // accept it). Wallet writes are routed by wagmi's connector transport,
    // not by these entries.
    //
    // The chain list itself (including the dev-only `localhost` entry) is
    // sourced from `app.config.ts` and `nuxt.config.ts`, gated there on
    // `process.env.NODE_ENV === 'development'`.
    const runtimeChains: Record<string, { rpcs?: string }> = Object.fromEntries(
      Object.entries(publicEvm.chains).map(([key, cfg]) => [
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
      chains: appConfig.evm?.chains ?? {},
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

    if (import.meta.client) {
      applyRpcUrlsToChains(
        wagmiConfig.chains as unknown as Chain[],
        evmConfig.rpcUrls ?? {},
      )
    }

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

/// Front-loads the configured RPC URL onto each chain so the injected
/// connector's `wallet_addEthereumChain` payload points at our proxy. Wagmi's
/// read transports are built from `runtimeChains` upstream, so this is only
/// for the wallet-add path. Clones the chain instead of mutating — for known
/// ids `resolveChain` returns the `viem/chains` singleton, and mutating it
/// would leak the proxy URL to every other consumer in the bundle.
function applyRpcUrlsToChains(
  chains: Chain[],
  rpcUrls: Record<number, string>,
) {
  for (let i = 0; i < chains.length; i++) {
    const chain = chains[i]
    if (!chain) continue
    const rpcUrl = rpcUrls[chain.id]
    if (!rpcUrl) continue
    const isHttp = /^https?:\/\//i.test(rpcUrl)
    const isWebSocket = /^wss?:\/\//i.test(rpcUrl)
    if (!isHttp && !isWebSocket) continue

    const existingHttp = chain.rpcUrls.default.http ?? []
    const existingWs = chain.rpcUrls.default.webSocket ?? []

    chains[i] = {
      ...chain,
      rpcUrls: {
        ...chain.rpcUrls,
        default: {
          ...chain.rpcUrls.default,
          http: isHttp ? [rpcUrl, ...existingHttp] : existingHttp,
          webSocket: isWebSocket ? [rpcUrl, ...existingWs] : existingWs,
        },
      },
    }
  }
}
