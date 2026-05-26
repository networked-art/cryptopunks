import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const siteDescription =
  'Zero-fee auction house for CryptoPunks — 24h auctions, multi-Punk lots, and native-ETH purchase offers.'

// Matches the gate in `app.config.ts` — dev-only entries only ship when
// Nuxt explicitly sets NODE_ENV=development (via `overrideEnv` in `nuxt dev`).
const isDev = process.env.NODE_ENV === 'development'
const require = createRequire(import.meta.url)
const layerRequire = createRequire(
  require.resolve('@1001-digital/layers.evm/package.json'),
)
const componentsOriginal = layerRequire.resolve('@1001-digital/components')
const componentsShim = fileURLToPath(
  new URL('./app/shims/1001-components.ts', import.meta.url),
)
const componentsAlias = '@1001-digital/components-original'
const loadingOverrideAliases = [
  { find: /^@1001-digital\/components$/, replacement: componentsShim },
  {
    find: /^@1001-digital\/components-original$/,
    replacement: componentsOriginal,
  },
]

type ViteAlias =
  | Record<string, string>
  | { find: string | RegExp; replacement: string }[]

function normalizeViteAliases(alias: ViteAlias | undefined) {
  return Array.isArray(alias)
    ? alias
    : Object.entries(alias ?? {}).map(([find, replacement]) => ({
        find,
        replacement,
      }))
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  extends: ['@1001-digital/layers.evm'],
  // ssr: false,

  devtools: { enabled: true },

  alias: {
    [componentsAlias]: componentsOriginal,
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
    'vite:extendConfig'(config) {
      const mutableConfig = config as {
        resolve?: {
          alias?: ViteAlias
        }
      }
      mutableConfig.resolve = {
        ...mutableConfig.resolve,
        // EVM layer components import `Loading` from the package export, which
        // bypasses Nuxt component shadowing. Keep this alias exact so deep
        // imports like `@1001-digital/components/client-only` still resolve.
        alias: [
          ...loadingOverrideAliases,
          ...normalizeViteAliases(mutableConfig.resolve?.alias),
        ],
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
