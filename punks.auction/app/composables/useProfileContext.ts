import type { InjectionKey, Ref } from 'vue'
import type { Address } from 'viem'

export type ProfileContext = {
  /** EOA the profile resolves to (null until the lookup settles). */
  resolvedAddress: Ref<Address | null>
  /** Defined only when the connected wallet matches `resolvedAddress`. */
  ownAccount: Ref<Address | undefined>
  isOwnProfile: Ref<boolean>
  vault: Ref<Address | null>
  stash: Ref<Address | null>
  wrapperProxy: Ref<Address | null>
  vaultDeployed: Ref<boolean>
  stashDeployed: Ref<boolean>
}

export const ProfileContextKey: InjectionKey<ProfileContext> =
  Symbol('ProfileContext')

/**
 * Child profile routes (`/profile/<handle>/<tab>`) read the parent layout's
 * resolved address and custody refs via inject so each tab page can stay
 * focused on its own concerns without re-resolving.
 */
export function useProfileContext(): ProfileContext {
  const ctx = inject(ProfileContextKey)
  if (!ctx) {
    throw new Error(
      'useProfileContext() called outside the /profile/[handle] layout',
    )
  }
  return ctx
}
