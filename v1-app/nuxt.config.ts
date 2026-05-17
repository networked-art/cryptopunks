export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  extends: ['@1001-digital/layers.evm'],

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
    public: {
      indexerUrl: '',
      punksMarketAddress: '',
      evm: {
        walletConnectProjectId: '',
        chains: {
          mainnet: { rpcs: '' },
        },
      },
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
