const siteDescription =
  '24-hour auctions. Zero fees. Real price discovery. CryptoPunks.'

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
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
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
      // Public indexer base URL (Ponder/Postgres GraphQL endpoint) for this
      // app. Override with NUXT_PUBLIC_INDEXER_URL.
      indexerUrl: 'https://indexer.punks.auction',
      // Broker brand shown in the "branded" Contact-broker preview. Override
      // per deployment with NUXT_PUBLIC_BROKER_NAME / NUXT_PUBLIC_BROKER_LOGO.
      // `logo` is inline SVG markup; use `fill="currentColor"` so it inherits
      // the surrounding text color.
      broker: {
        name: 'Canon',
        logo: '<svg viewBox="0 0 234 45" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.244 44.764C10.7467 44.764 6.65467 42.8213 3.968 38.936C1.32267 35.0507 0 29.5327 0 22.382C0 15.2313 1.32267 9.71333 3.968 5.828C6.65467 1.94267 10.7467 0 16.244 0C18.352 0 20.1707 0.289333 21.7 0.868C23.2707 1.40533 24.614 2.17 25.73 3.162C26.846 4.11267 27.776 5.24933 28.52 6.572C29.3053 7.85333 29.946 9.238 30.442 10.726L24.18 12.834C23.8493 11.842 23.4773 10.912 23.064 10.044C22.6507 9.176 22.134 8.432 21.514 7.812C20.894 7.192 20.15 6.696 19.282 6.324C18.4553 5.952 17.422 5.766 16.182 5.766C13.1233 5.766 10.8913 6.944 9.486 9.3C8.08067 11.6147 7.378 14.756 7.378 18.724V26.04C7.378 30.008 8.08067 33.17 9.486 35.526C10.8913 37.8407 13.1233 38.998 16.182 38.998C17.422 38.998 18.4553 38.812 19.282 38.44C20.15 38.068 20.894 37.572 21.514 36.952C22.134 36.332 22.6507 35.588 23.064 34.72C23.4773 33.852 23.8493 32.922 24.18 31.93L30.442 34.038C29.946 35.526 29.3053 36.9313 28.52 38.254C27.776 39.5353 26.846 40.672 25.73 41.664C24.614 42.6147 23.2707 43.3793 21.7 43.958C20.1707 44.4953 18.352 44.764 16.244 44.764Z" fill="currentColor"/><path d="M75.8638 44.02L72.5778 32.488H58.8138L55.5278 44.02H48.4598L61.1078 0.744002H70.5938L83.2418 44.02H75.8638ZM65.9438 7.75H65.4478L60.1158 26.722H71.2758L65.9438 7.75Z" fill="currentColor"/><path d="M109.134 10.726H108.576V44.02H102.5V0.744002H111.428L124.138 34.038H124.696V0.744002H130.772V44.02H121.844L109.134 10.726Z" fill="currentColor"/><path d="M167.451 44.764C164.723 44.764 162.347 44.268 160.321 43.276C158.337 42.2427 156.684 40.7753 155.361 38.874C154.08 36.9727 153.129 34.6373 152.509 31.868C151.889 29.0987 151.579 25.9367 151.579 22.382C151.579 18.8687 151.889 15.7273 152.509 12.958C153.129 10.1473 154.08 7.79134 155.361 5.89C156.684 3.98867 158.337 2.542 160.321 1.55C162.347 0.516666 164.723 0 167.451 0C170.179 0 172.535 0.516666 174.519 1.55C176.545 2.542 178.198 3.98867 179.479 5.89C180.802 7.79134 181.773 10.1473 182.393 12.958C183.013 15.7273 183.323 18.8687 183.323 22.382C183.323 25.9367 183.013 29.0987 182.393 31.868C181.773 34.6373 180.802 36.9727 179.479 38.874C178.198 40.7753 176.545 42.2427 174.519 43.276C172.535 44.268 170.179 44.764 167.451 44.764ZM167.451 38.998C170.551 38.998 172.742 37.8407 174.023 35.526C175.305 33.17 175.945 29.9873 175.945 25.978V18.724C175.945 14.756 175.305 11.6147 174.023 9.3C172.742 6.944 170.551 5.766 167.451 5.766C164.351 5.766 162.161 6.944 160.879 9.3C159.598 11.6147 158.957 14.756 158.957 18.724V26.04C158.957 30.008 159.598 33.17 160.879 35.526C162.161 37.8407 164.351 38.998 167.451 38.998Z" fill="currentColor"/><path d="M210.765 10.726H210.207V44.02H204.131V0.744002H213.059L225.769 34.038H226.327V0.744002H232.403V44.02H223.475L210.765 10.726Z" fill="currentColor"/></svg>',
      },
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
