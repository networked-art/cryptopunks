import { createPunksSdk, type PunksSdk } from '@networked-art/punks-sdk'
import { getPublicClient, getWalletClient } from '@wagmi/core'
import { useAccount, useConfig } from '@wagmi/vue'
import type { PublicClient, WalletClient } from 'viem'

/** Offline SDK — search, dataset, rendering. Available everywhere. */
export function usePunksOffline(): PunksSdk {
  const { $punksOffline } = useNuxtApp()
  return $punksOffline as PunksSdk
}

/** SDK bound to the current public/wallet client. Read-only when disconnected. */
export function usePunksSdk() {
  const offline = usePunksOffline()
  const nuxtApp = useNuxtApp()
  const dataset = nuxtApp.$punksDataset as Parameters<
    typeof createPunksSdk
  >[0] extends infer C
    ? C extends { dataset?: infer D }
      ? D
      : never
    : never
  const config = useConfig()
  const { address } = useAccount()

  const publicClient = computed(
    () => getPublicClient(config) as PublicClient | undefined,
  )

  // Recreate the SDK whenever the connected wallet changes. The dataset
  // bundle is reused so we don't re-parse the bitmap on every connect.
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
    })
  })

  return { sdk, publicClient, address }
}
