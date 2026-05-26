<template>
  <div class="container profile-page">
    <header class="profile-head">
      <img
        v-if="profileAvatarUri"
        class="profile-avvatar"
        :src="profileAvatarUri"
        :alt="`Avatar for ${titleLabel}`"
      />

      <div class="profile-details">
        <div class="profile-title">
          <h1
            v-if="ensProfile.data.value?.ens"
            class="profile-name"
          >
            {{ ensProfile.data.value.ens }}
          </h1>
          <h1
            v-else
            class="profile-name muted"
          >
            {{ shortAddr }}
          </h1>

          <ClientOnly>
            <NuxtLink
              v-if="isOwnProfile"
              to="/settings"
              class="settings-link muted"
              aria-label="Settings"
              title="Settings"
            >
              <Icon name="lucide:settings" />
            </NuxtLink>
          </ClientOnly>
        </div>

        <ClientOnly>
          <p
            v-if="resolvedAddress"
            class="profile-address muted"
          >
            {{ resolvedAddress }}
          </p>
          <p
            v-else-if="resolving"
            class="muted"
          >
            Resolving…
          </p>
          <p
            v-else
            class="error"
          >
            Could not resolve {{ handle }}
          </p>
        </ClientOnly>

        <LazyProfileStatusPills
          v-if="resolvedAddress"
          :vault="vault"
          :stash="stash"
          :wrapper-proxy="wrapperProxy"
          :vault-deployed="vaultDeployed"
          :stash-deployed="stashDeployed"
        />
      </div>
    </header>

    <ClientOnly v-if="isOwnProfile">
      <ProfileTabs :handle="handle" />
    </ClientOnly>

    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
import { getPublicClient } from '@wagmi/core'
import { useConfig, useConnection } from '@wagmi/vue'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'
import { accountAvvatarDataUri } from '~/utils/avvatar'
import { ProfileContextKey } from '~/composables/useProfileContext'

const route = useRoute()
const router = useRouter()
const handle = computed(() => String(route.params.handle))

const config = useConfig()
const { address: connectedAddress } = useConnection()

const ensProfile = useEnsWithAvatar(handle)

const resolving = ref(true)
const resolvedAddress = ref<Address | null>(null)
// Token guard for the async watchEffect: each run bumps the counter and
// checks it before writing back, so a slow earlier resolution (ENS round-trip
// + indexer round-trip) can't clobber a newer one started after a quick
// handle change.
let resolveToken = 0

watchEffect(async () => {
  const t = ++resolveToken
  const h = handle.value
  const handleIsAddress = isAddress(h)
  resolving.value = true

  let eoa: Address | null = null
  if (handleIsAddress) {
    eoa = h as Address
  } else {
    const client = getPublicClient(config) as PublicClient | undefined
    if (!client) {
      if (t === resolveToken) resolving.value = false
      return
    }
    try {
      const addr = await client.getEnsAddress({ name: h })
      eoa = (addr as Address | null) ?? null
    } catch {
      eoa = null
    }
    if (t !== resolveToken) return
  }

  // Canonicalize URLs of the form `/profile/<vault|stash|wrapperProxy>` to
  // `/profile/<owner>` so a single profile is always reachable via the same
  // address. Only attempted when the handle is already an address — ENS
  // handles are user-chosen and stay verbatim.
  if (handleIsAddress && eoa) {
    const resolved = await resolveProfileAddress(eoa)
    if (t !== resolveToken) return
    if (resolved.redirect) {
      // Clear the spinner before navigating; the next `handle` change will
      // re-run this effect with the canonical address. Without this, the
      // template renders "Resolving…" indefinitely if `router.replace`
      // resolves on the next microtask.
      resolving.value = false
      void router.replace(`/profile/${resolved.canonical}`)
      return
    }
  }

  resolvedAddress.value = eoa
  resolving.value = false
})

const shortAddr = computed(() =>
  resolvedAddress.value ? shortAddress(resolvedAddress.value) : handle.value,
)

const isOwnProfile = computed(() => {
  const mine = connectedAddress.value?.toLowerCase()
  const viewing = resolvedAddress.value?.toLowerCase()
  return !!mine && !!viewing && mine === viewing
})
const ownAccount = computed(() =>
  isOwnProfile.value ? (resolvedAddress.value ?? undefined) : undefined,
)

const titleLabel = computed(() => ensProfile.data.value?.ens ?? shortAddr.value)
const profileAvatarUri = computed(() =>
  resolvedAddress.value
    ? accountAvvatarDataUri(resolvedAddress.value, 90)
    : undefined,
)

useSeoMeta({
  title: () => `${titleLabel.value} · Punks Auction`,
  ogTitle: () => `${titleLabel.value} · Punks Auction`,
  twitterTitle: () => `${titleLabel.value} · Punks Auction`,
})

const profileAddress = computed(() => resolvedAddress.value ?? undefined)

const {
  vault,
  stash,
  wrapperProxy,
  vaultDeployed,
  stashDeployed,
  refresh: refreshAddresses,
} = useAccountAddresses(profileAddress)

provide(ProfileContextKey, {
  resolvedAddress,
  ownAccount,
  isOwnProfile,
  vault,
  stash,
  wrapperProxy,
  vaultDeployed,
  stashDeployed,
  refreshAddresses,
})
</script>

<style scoped>
.profile-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.profile-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--size-4);
}

.profile-avvatar {
  width: clamp(56px, 12vw, 90px);
  aspect-ratio: 1;
  flex: 0 0 auto;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.profile-details {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.profile-title {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.profile-name {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.settings-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  font-size: var(--font-lg);
  line-height: var(--line-height);
  padding: var(--size-1);
}

.settings-link:hover {
  color: var(--text);
}

.profile-address {
  margin: 0;
  font-size: var(--font-sm);
  overflow-wrap: anywhere;
}

.error {
  color: var(--accent);
  font-size: var(--font-sm);
}

@media (max-width: 520px) {
  .profile-head {
    align-items: flex-start;
  }
}
</style>
