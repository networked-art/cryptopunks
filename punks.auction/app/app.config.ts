// In dev we target the hardhat fork (chainId 31337); production targets
// real mainnet (chainId 1). The wagmi plugin in `app/plugins/wagmi.ts`
// injects the matching `localhost` chain when `import.meta.dev` is true,
// so the `defaultChain` key resolves on both sides.
const isDev = process.env.NODE_ENV !== 'production'

export default defineAppConfig({
  evm: {
    title: 'Punks Auction',
    inAppWallet: { enabled: true },
    defaultChain: isDev ? 'localhost' : 'mainnet',
  },
})
