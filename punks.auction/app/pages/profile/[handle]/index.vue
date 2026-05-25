<template>
  <ClientOnly>
    <div
      v-if="resolvedAddress"
      class="profile-cols"
    >
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
          <LazyPunkGrid
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
          <LazyLotCard
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
          <LazyOfferCard
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
</template>

<script setup lang="ts">
const { resolvedAddress, vault, stash } = useProfileContext()

const profileAddress = computed(() => resolvedAddress.value ?? undefined)

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

// Lots/offers the profile owns are filtered by `seller`/`offerer` matching
// any of the user's custody addresses: EOA, vault, or stash. (Wrapper proxy
// is excluded — it's a transient wrap-flow intermediary, never an at-rest
// seller.)
const ownerAddresses = computed(() => {
  const set = new Set<string>()
  const a = resolvedAddress.value?.toLowerCase()
  if (a) set.add(a)
  const v = vault.value?.toLowerCase()
  if (v) set.add(v)
  const s = stash.value?.toLowerCase()
  if (s) set.add(s)
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
</style>
