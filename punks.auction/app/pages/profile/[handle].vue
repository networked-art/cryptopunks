<template>
  <div class="container profile-page">
    <header class="profile-head">
      <template v-if="resolvedAddress">
        <img
          v-if="profileAvatarUri"
          class="profile-avvatar"
          :src="profileAvatarUri"
          :alt="`Avatar for ${titleLabel}`"
        />

        <div class="profile-details">
          <div class="profile-title">
            <ClientOnly>
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
              <template #fallback>
                <h1 class="profile-name muted">{{ shortAddr }}</h1>
              </template>
            </ClientOnly>
          </div>

          <p class="profile-address muted">
            {{ resolvedAddress }}
          </p>

          <LazyProfileStatusPills
            :vault="vault"
            :stash="stash"
            :wrapper-proxy="wrapperProxy"
            :vault-deployed="vaultDeployed"
            :stash-deployed="stashDeployed"
          />
        </div>
      </template>

      <div
        v-else-if="resolving"
        class="profile-loading"
      >
        <Spinner :label="`Resolving ${handle}`" />
      </div>

      <p
        v-else
        class="error"
      >
        Could not resolve {{ handle }}
      </p>
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

// Initialize state synchronously from `handle` so SSR can render the
// header for address handles without waiting on async resolution.
const initialIsAddress = isAddress(handle.value)
const resolvedAddress = ref<Address | null>(
  initialIsAddress ? (handle.value as Address) : null,
)
const resolving = ref(!initialIsAddress)

// Token guard for the async resolver: each run bumps the counter and
// checks it before writing back, so a slow earlier resolution (ENS round-trip
// + indexer round-trip) can't clobber a newer one started after a quick
// handle change.
let resolveToken = 0

async function resolveHandle() {
  const t = ++resolveToken
  const h = handle.value
  const handleIsAddress = isAddress(h)

  if (handleIsAddress) {
    resolvedAddress.value = h as Address
    resolving.value = false

    // Canonicalize URLs of the form `/profile/<vault|stash|wrapperProxy>` to
    // `/profile/<owner>`. Indexer call is client-only so SSR doesn't depend
    // on the indexer being reachable from the server runtime.
    if (import.meta.client) {
      const resolved = await resolveProfileAddress(h as Address)
      if (t !== resolveToken) return
      if (resolved.redirect) {
        void router.replace(`/profile/${resolved.canonical}`)
      }
    }
    return
  }

  resolvedAddress.value = null
  resolving.value = true

  const client = getPublicClient(config) as PublicClient | undefined
  if (!client) {
    if (t === resolveToken) resolving.value = false
    return
  }
  let eoa: Address | null = null
  try {
    const addr = await client.getEnsAddress({ name: h })
    eoa = (addr as Address | null) ?? null
  } catch {
    eoa = null
  }
  if (t !== resolveToken) return
  resolvedAddress.value = eoa
  resolving.value = false
}

watch(handle, () => void resolveHandle(), { immediate: true })

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

const { data: ogProfile } = await useAsyncData(
  () => `og-profile-${handle.value}`,
  async () => {
    const h = handle.value
    const client = getPublicClient(config) as PublicClient | undefined
    if (!client) return null

    if (isAddress(h)) {
      let ens: string | null = null
      try {
        ens = (await client.getEnsName({ address: h as Address })) ?? null
      } catch {
        ens = null
      }
      return { address: h as Address, ens }
    }

    try {
      const addr = await client.getEnsAddress({ name: h })
      if (!addr) return null
      return { address: addr as Address, ens: h }
    } catch {
      return null
    }
  },
)

// defineOgImage('Profile', {
//   address:
//     ogProfile.value?.address ?? '0x0000000000000000000000000000000000000000',
//   ens: ogProfile.value?.ens ?? null,
// })

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

.profile-address {
  margin: 0;
  font-size: var(--font-sm);
  overflow-wrap: anywhere;
}

.profile-loading {
  display: flex;
  align-items: center;
  min-height: clamp(56px, 12vw, 90px);
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
