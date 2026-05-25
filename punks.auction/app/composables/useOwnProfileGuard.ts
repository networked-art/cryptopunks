/**
 * Watches `isOwnProfile` from `useProfileContext()` and redirects to the
 * profile's index tab once the wallet check resolves false. The watch is
 * intentionally `immediate: false` so we wait for the parent's address
 * resolution to settle before deciding — otherwise we'd bounce away on every
 * cold page load before the wallet check has run.
 */
export function useOwnProfileGuard() {
  const router = useRouter()
  const route = useRoute()
  const { isOwnProfile, resolvedAddress } = useProfileContext()

  watch(
    [isOwnProfile, resolvedAddress],
    ([own, addr]) => {
      if (addr && !own) {
        const handle = String(route.params.handle ?? '')
        if (handle) void router.replace(`/profile/${handle}`)
      }
    },
    { immediate: true },
  )
}
