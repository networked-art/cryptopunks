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
      </div>
    </header>

    <ClientOnly>
      <div
        v-if="resolvedAddress"
        class="profile-cols"
      >
        <ProfileAddresses :account="resolvedAddress" />

        <ProfileManager
          v-if="ownAccount"
          :account="ownAccount"
        />

        <section class="profile-section">
          <h2 class="section-title eyebrow">Owned Punks</h2>
          <p
            v-if="ownedLoading"
            class="muted"
          >
            Loading…
          </p>
          <p
            v-else-if="ownedError"
            class="error"
          >
            Could not load owned Punks: {{ ownedError }}
          </p>
          <template v-else-if="owned.length">
            <PunkGrid
              :ids="owned"
              :size="48"
            />
            <p
              v-if="breakdownLabel"
              class="muted breakdown"
            >
              {{ breakdownLabel }}
            </p>
          </template>
          <p
            v-else
            class="muted"
          >
            No CryptoPunks held.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title eyebrow">Active lots</h2>
          <div
            v-if="myLots.length"
            class="card-grid"
          >
            <LotCard
              v-for="lot in myLots"
              :key="String(lot.id)"
              :lot="lot"
            />
          </div>
          <p
            v-else
            class="muted"
          >
            No open lots.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title eyebrow">Active offers</h2>
          <div
            v-if="myOffers.length"
            class="card-grid"
          >
            <OfferCard
              v-for="offer in myOffers"
              :key="String(offer.id)"
              :offer="offer"
            />
          </div>
          <p
            v-else
            class="muted"
          >
            No open purchase offers.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title eyebrow">Recent activity</h2>
          <ul
            v-if="activity.length"
            class="event-list"
          >
            <ActivityRow
              v-for="event in activity"
              :key="event.id"
              :event="event"
            />
          </ul>
          <p
            v-else
            class="muted"
          >
            No activity for this address.
          </p>
        </section>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { getPublicClient } from '@wagmi/core'
import { useConfig, useConnection } from '@wagmi/vue'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { shortAddress } from '@1001-digital/components.evm'
import { accountAvvatarDataUri } from '~/utils/avvatar'

const route = useRoute()
const router = useRouter()
const handle = computed(() => String(route.params.handle))

const config = useConfig()
const { address: connectedAddress } = useConnection()

const ensProfile = useEnsWithAvatar(handle)

const resolving = ref(true)
const resolvedAddress = ref<Address | null>(null)

watchEffect(async () => {
  resolving.value = true
  const h = handle.value
  const handleIsAddress = isAddress(h)

  let eoa: Address | null = null
  if (handleIsAddress) {
    eoa = h as Address
  } else {
    const client = getPublicClient(config) as PublicClient | undefined
    if (!client) {
      resolving.value = false
      return
    }
    try {
      const addr = await client.getEnsAddress({ name: h })
      eoa = (addr as Address | null) ?? null
    } catch {
      eoa = null
    }
  }

  // Canonicalize URLs of the form `/profile/<vault|stash|userProxy>` to
  // `/profile/<owner>` so a single profile is always reachable via the same
  // address. Only attempted when the handle is already an address — ENS
  // handles are user-chosen and stay verbatim.
  if (handleIsAddress && eoa) {
    const resolved = await resolveProfileAddress(eoa)
    if (resolved.redirect) {
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
    ? accountAvvatarDataUri(resolvedAddress.value, 72)
    : undefined,
)

useSeoMeta({
  title: () => `${titleLabel.value} · Punks Auction`,
  ogTitle: () => `${titleLabel.value} · Punks Auction`,
  twitterTitle: () => `${titleLabel.value} · Punks Auction`,
})

const profileAddress = computed(() => resolvedAddress.value ?? undefined)

const { vault, stash } = useAccountAddresses(profileAddress)

const {
  ids: owned,
  breakdown,
  loading: ownedLoading,
  error: ownedError,
} = useAccountPunks({ account: profileAddress, vault, stash })

const breakdownLabel = computed(() => {
  const parts: string[] = []
  if (breakdown.value.wallet) parts.push(`${breakdown.value.wallet} in wallet`)
  if (breakdown.value.vault) parts.push(`${breakdown.value.vault} in vault`)
  if (breakdown.value.wrapped) parts.push(`${breakdown.value.wrapped} wrapped`)
  if (breakdown.value.stash) parts.push(`${breakdown.value.stash} in stash`)
  return parts.join(' · ')
})

const { events: activity } = useActivityFeed({ address: profileAddress })
const { lots } = useLots()
const { offers } = useOffers()

const ownerAddresses = computed(() => {
  const set = new Set<string>()
  const a = resolvedAddress.value?.toLowerCase()
  if (a) set.add(a)
  const v = vault.value?.toLowerCase()
  if (v) set.add(v)
  return set
})

const myLots = computed(() => {
  const addrs = ownerAddresses.value
  if (!addrs.size) return []
  return lots.value.filter((lot) => addrs.has(lot.seller.toLowerCase()))
})

const myOffers = computed(() => {
  const addrs = ownerAddresses.value
  if (!addrs.size) return []
  return offers.value.filter((offer) => addrs.has(offer.offerer.toLowerCase()))
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
  width: clamp(48px, 10.5vw, 72px);
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

.profile-cols {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-bottom: 0;
  background: var(--bg-elevated);
}

.error {
  color: var(--accent);
  font-size: var(--font-sm);
}

.breakdown {
  margin: 0;
  margin-top: var(--size-2);
  font-size: var(--font-xs);
}

@media (max-width: 520px) {
  .profile-head {
    align-items: flex-start;
  }
}
</style>
