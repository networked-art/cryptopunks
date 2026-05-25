const siteDescription = 'Native-ETH market for the broken C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎.'

// Matches the gate in `app.config.ts` — dev-only entries only ship when
// Nuxt explicitly sets NODE_ENV=development (via `overrideEnv` in `nuxt dev`).
const isDev = process.env.NODE_ENV === 'development'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  extends: ['@1001-digital/layers.evm'],
  // ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'punksmarket.app',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        {
          name: 'description',
          content: siteDescription,
        },
        { property: 'og:title', content: 'punksmarket.app' },
        { property: 'og:description', content: siteDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: 'https://punksmarket.app/og.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '675' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: 'https://punksmarket.app/og.png' },
      ],
      link: [{ rel: 'icon', type: 'image/png', href: '/icon.png' }],
    },
  },

  css: ['~/assets/css/app.css'],

  routeRules: {
    // `/punk` has no page of its own — only `/punk/:id`. Bounce to the grid.
    '/punk': { redirect: '/' },
  },

  runtimeConfig: {
    // Server-only RPC URL. Override with NUXT_RPC_URL.
    rpcUrl: '',
    public: {
      // Public origin used to build absolute URLs (e.g. the in-app RPC
      // proxy). Override with NUXT_PUBLIC_PUBLIC_URL in production.
      publicUrl: 'http://localhost:3000',
      indexerUrl: 'https://indexer.punksmarket.app',
      evm: {
        walletConnectProjectId: '',
        chains: {
          // Browser reads route through the same-origin proxy below. The
          // server-side wagmi plugin override swaps this for `rpcUrl` so
          // viem-on-Node hits the upstream directly. The wagmi plugin
          // also prefixes this path with `publicUrl` to make it absolute,
          // since viem/walletconnect both require absolute URLs.
          mainnet: { rpcs: '/api/rpc' },
          // Dev-only: hardhat fork RPC, same proxy. `NUXT_RPC_URL` in the
          // local `.env` decides what the proxy forwards to.
          ...(isDev ? { localhost: { rpcs: '/api/rpc' } } : {}),
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
        '@1001-digital/layers.evm > @1001-digital/components.evm',
        '@tanstack/vue-query',
        // '@networked-art/punks-sdk',
        // '@networked-art/punks-sdk/offline',
      ],
    },
  },
})
