const siteDescription =
  'Zero-fee auction house for CryptoPunks — 24h auctions, multi-Punk lots, and native-ETH purchase offers.'

// Matches the gate in `app.config.ts` — dev-only entries only ship when
// Nuxt explicitly sets NODE_ENV=development (via `overrideEnv` in `nuxt dev`).
const isDev = process.env.NODE_ENV === 'development'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  extends: ['@1001-digital/layers.evm'],
  modules: ['nuxt-og-image'],
  // ssr: false,

  devtools: { enabled: true },

  // `site.url` (used by nuxt-og-image to build absolute og:image URLs) is set
  // at runtime via the `NUXT_SITE_URL` env var, which nuxt-site-config reads
  // on every request. In dev, the origin auto-detects from the request host.

  ogImage: {
    defaults: { width: 1200, height: 630, cacheMaxAgeSeconds: 60 * 60 * 24 },
  },

  app: {
    head: {
      title: 'Punks Auction',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        {
          name: 'description',
          content: siteDescription,
        },
        { property: 'og:title', content: 'Punks Auction' },
        { property: 'og:description', content: siteDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: 'https://punks.auction/og.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '675' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: 'https://punks.auction/og.png' },
      ],
      link: [{ rel: 'icon', type: 'image/png', href: '/icon.png' }],
    },
  },

  css: ['~/assets/css/app.css'],

  routeRules: {
    // `/punks/v1` has no page of its own — only `/punks/v1/:id`. Bounce to
    // the grid so it doesn't fall through to the `/punks/:id` not-found state.
    '/punks/v1': { redirect: '/punks' },
  },

  runtimeConfig: {
    // Server-only RPC URL. Override with NUXT_RPC_URL.
    rpcUrl: '',
    public: {
      // Public origin used to build absolute URLs (e.g. the in-app RPC
      // proxy). Override with NUXT_PUBLIC_PUBLIC_URL in production.
      publicUrl: 'http://localhost:3000',
      // Public indexer base URL (Ponder/Postgres GraphQL endpoint) — the
      // shared indexer that backs both punksmarket.app and this app.
      // Override with NUXT_PUBLIC_INDEXER_URL.
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
    // Drop the layer's wagmi plugin so `app/plugins/wagmi.ts` is the only one
    // that registers — the throw catches a layer rename that would otherwise
    // leave both plugins running.
    'app:resolve'(app) {
      const layerWagmiRe = /layers\.evm[/\\]app[/\\]plugins[/\\]wagmi\./
      const before = app.plugins.length
      app.plugins = app.plugins.filter((p) => !layerWagmiRe.test(p.src))
      if (app.plugins.length === before) {
        throw new Error(
          "[nuxt.config] Layer's wagmi plugin not found; update the regex to match the installed @1001-digital/layers.evm path.",
        )
      }
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
        '@tanstack/vue-query',
      ],
    },
  },
})
