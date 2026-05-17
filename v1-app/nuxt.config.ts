export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  extends: ['@1001-digital/layers.evm'],
  // ssr: false,

  devtools: false,

  app: {
    head: {
      title: 'punksmarket.xyz',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          name: 'description',
          content:
            'Search, bid, and trade CryptoPunks. A clean V1 marketplace.',
        },
        { property: 'og:title', content: 'punksmarket.xyz' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [{ rel: 'icon', type: 'image/png', href: '/icon.png' }],
    },
  },

  css: ['~/assets/css/app.css'],

  runtimeConfig: {
    // Server-only RPC URL. Override with NUXT_RPC_URL.
    rpcUrl: '',
    public: {
      indexerUrl: 'https://indexer-v1.punksmarket.app',
      punksMarketAddress: '',
      evm: {
        walletConnectProjectId: '',
        chains: {
          // Browser reads route through the same-origin proxy below. The
          // server-side wagmi plugin override swaps this for `rpcUrl` so
          // viem-on-Node hits the upstream directly.
          mainnet: { rpcs: '/api/rpc' },
        },
      },
    },
  },

  hooks: {
    // The layer ships its own wagmi plugin; we replace it with
    // `app/plugins/wagmi.ts` to swap the read RPC per environment.
    'app:resolve'(app) {
      app.plugins = app.plugins.filter(
        (p) => !/layers\.evm[/\\]app[/\\]plugins[/\\]wagmi\./.test(p.src),
      )
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@1001-digital/layers.evm > @metamask/connect-evm',
        '@1001-digital/layers.evm > eventemitter3',
        '@1001-digital/layers.evm > qrcode',
        '@1001-digital/layers.evm > @walletconnect/ethereum-provider',
        '@1001-digital/layers.evm > @safe-global/safe-apps-sdk',
        '@1001-digital/layers.evm > @safe-global/safe-apps-provider',
        '@networked-art/punks-sdk',
        '@networked-art/punks-sdk/offline',
      ],
    },
  },
})
