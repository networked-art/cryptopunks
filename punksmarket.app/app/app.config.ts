// In dev we target the hardhat fork (chainId 31337); anything else (prod
// build, unset, staging) targets real mainnet (chainId 1). Positive check
// so any unexpected NODE_ENV value fails *closed* into prod behaviour.
// `nuxt dev` sets NODE_ENV='development' via `overrideEnv` before app.config
// is loaded; `nuxt build` sets it to 'production' the same way.
const isDev = process.env.NODE_ENV === 'development'

export default defineAppConfig({
  evm: {
    title: 'punksmarket.app',
    inAppWallet: { enabled: true },
    defaultChain: isDev ? 'localhost' : 'mainnet',
    // Local hardhat fork — only present in dev so production users never
    // see "Hardhat" in the wallet's chain picker. The matching `rpcs` entry
    // lives in `nuxt.config.ts` (gated identically). Spread so the key is
    // absent in prod and deep-merge leaves the layer's `chains` intact.
    ...(isDev && { chains: { localhost: { id: 31337 } } }),
  },
})
