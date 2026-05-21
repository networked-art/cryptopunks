import type { PunksSdk } from '@networked-art/punks-sdk'
import { getPublicClient } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import type { PublicClient } from 'viem'

/** Offline SDK — search, dataset, rendering. Available everywhere. */
export function usePunksOffline(): PunksSdk {
  const { $punksOffline } = useNuxtApp()
  return $punksOffline as PunksSdk
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
