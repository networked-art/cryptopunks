import {
  createPunksSdk,
  type PunksSdk,
  type PunksSdkConfig,
} from '@networked-art/punks-sdk'
import { getPublicClient, getWalletClient } from '@wagmi/core'
import { useConnection, useConfig } from '@wagmi/vue'
import type { PublicClient, WalletClient } from 'viem'
import {
  CRYPTOPUNKS_ADDRESS,
  PUNKS_AUCTION_ADDRESS,
  PUNKS_V1_ADDRESS,
} from '~/utils/addresses'

/** Offline SDK — search and dataset reads. Available everywhere. */
export function usePunksOffline(): PunksSdk {
  const { $punksOffline } = useNuxtApp()
  return $punksOffline as PunksSdk
}

/** SDK bound to the current public/wallet client. Read-only when disconnected. */
export function usePunksSdk() {
  const offline = usePunksOffline()
  const nuxtApp = useNuxtApp()
  const dataset = nuxtApp.$punksDataset as PunksSdkConfig['dataset']
  const config = useConfig()
  const { address } = useConnection()

  const publicClient = computed(
    () => getPublicClient(config) as PublicClient | undefined,
  )

  const sdk = ref<PunksSdk>(offline)

  watchEffect(async () => {
    const account = address.value
    const wallet = account
      ? ((await getWalletClient(config).catch(() => undefined)) as
          | WalletClient
          | undefined)
      : undefined

    sdk.value = createPunksSdk({
      dataset,
      publicClient: publicClient.value,
      walletClient: wallet,
      account,
      addresses: {
        market: CRYPTOPUNKS_ADDRESS,
        v1Market: PUNKS_V1_ADDRESS,
        auction: PUNKS_AUCTION_ADDRESS,
      },
    })
  })

  return { sdk, publicClient, address }
}

/**
 * The wagmi public client used for every on-chain read. In the browser these
 * route through the same-origin `/api/rpc` proxy; during SSR the wagmi plugin
 * swaps in the upstream URL directly.
 */
export function useReadClient() {
  const config = useConfig()
  return computed(() => getPublicClient(config) as PublicClient | undefined)
}
