<template>
  <div class="container profile-page">
    <header class="profile-head">
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

        <p
          v-if="resolvedAddress && escrowBalance > 0n"
          class="escrow"
        >
          <span class="escrow-label">Claimable escrow</span>
          <EthAmount :wei="escrowBalance" />
        </p>
      </ClientOnly>
    </header>

    <ClientOnly>
      <div
        v-if="resolvedAddress"
        class="profile-cols"
      >
        <section class="profile-section">
          <h2 class="section-title">Owned Punks</h2>
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
          <PunkGrid
            v-else-if="owned.length"
            :ids="owned"
            :size="48"
          />
          <p
            v-else
            class="muted"
          >
            No canonical Punks held.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title">Active lots</h2>
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
          <h2 class="section-title">Active offers</h2>
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
          <h2 class="section-title">Recent activity</h2>
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
            No auction activity for this address.
          </p>
        </section>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { getPublicClient } from '@wagmi/core'
import { useConfig } from '@wagmi/vue'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { shortAddress } from '@1001-digital/components.evm'

const route = useRoute()
const handle = computed(() => String(route.params.handle))

const config = useConfig()

const ensProfile = useEnsWithAvatar(handle)

const resolving = ref(true)
const resolvedAddress = ref<Address | null>(null)

watchEffect(async () => {
  resolving.value = true
  const h = handle.value
  if (isAddress(h)) {
    resolvedAddress.value = h as Address
    resolving.value = false
    return
  }
  const client = getPublicClient(config) as PublicClient | undefined
  if (!client) {
    resolving.value = false
    return
  }
  try {
    const addr = await client.getEnsAddress({ name: h })
    resolvedAddress.value = addr as Address | null
  } catch {
    resolvedAddress.value = null
  } finally {
    resolving.value = false
  }
})

const shortAddr = computed(() =>
  resolvedAddress.value ? shortAddress(resolvedAddress.value) : handle.value,
)

const titleLabel = computed(() => ensProfile.data.value?.ens ?? shortAddr.value)
useSeoMeta({
  title: () => `${titleLabel.value} · Punks Auction`,
  ogTitle: () => `${titleLabel.value} · Punks Auction`,
  twitterTitle: () => `${titleLabel.value} · Punks Auction`,
})

const profileAddress = computed(() => resolvedAddress.value ?? undefined)

const {
  ids: owned,
  loading: ownedLoading,
  error: ownedError,
} = useOwnedPunks(profileAddress)

const { balance: escrowBalance } = useEscrowBalance(profileAddress)
const { events: activity } = useActivityFeed({ address: profileAddress })
const { lots } = useLots()
const { offers } = useOffers()

const myLots = computed(() => {
  const a = resolvedAddress.value?.toLowerCase()
  if (!a) return []
  return lots.value.filter((lot) => lot.seller.toLowerCase() === a)
})

const myOffers = computed(() => {
  const a = resolvedAddress.value?.toLowerCase()
  if (!a) return []
  return offers.value.filter((offer) => offer.offerer.toLowerCase() === a)
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
  flex-direction: column;
  gap: var(--size-1);
}

.profile-name {
  margin: 0;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.profile-address {
  margin: 0;
  font-size: 12px;
}

.escrow {
  margin: var(--size-2) 0 0;
  display: flex;
  align-items: baseline;
  gap: var(--size-2);
  font-size: 13px;
}

.escrow-label {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--text-dim);
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
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
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
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.error {
  color: var(--accent);
  font-size: 12px;
}
</style>
