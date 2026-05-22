import { useStorage } from '@vueuse/core'

/// Opt-in flag for rendering V1 Punks alongside the canonical `CryptoPunks`.
/// Persisted in localStorage; defaults to off.
export function useV1Rendering() {
  return useStorage('punks-auction.render-v1', false)
}
