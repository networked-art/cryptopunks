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
      </ClientOnly>
    </header>

    <ClientOnly>
      <div
        v-if="resolvedAddress"
        class="profile-cols"
      >
        <section class="profile-section">
          <UnwrapAllPunks
            v-if="viewerOwnedAddress && owned?.length > 1"
            :owner="viewerOwnedAddress"
            :owned="owned"
          />
          <h2 class="section-title">Owned punks</h2>
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
            Could not load owned punks. Configure
            <code>NUXT_PUBLIC_INDEXER_URL</code> for instant results.
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
            No punks held.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title">Collection bids placed</h2>
          <div
            v-if="bids.length"
            class="bid-grid"
          >
            <BidCard
              v-for="b in bids"
              :key="String(b.id)"
              :bid="b"
              @withdrawn="refreshBids"
              @adjusted="refreshBids"
            />
          </div>
          <p
            v-else
            class="muted"
          >
            No active collection bids.
          </p>
        </section>

        <section class="profile-section">
          <h2 class="section-title">Recent activity</h2>
          <ul
            v-if="activity.length"
            class="event-list"
          >
            <ActivityRow
              v-for="(e, i) in activity"
              :key="`${e.txHash}-${i}`"
              :event="e"
            />
          </ul>
          <p
            v-else
            class="muted"
          >
            No recent activity for this address.
          </p>
        </section>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { getPublicClient } from '@wagmi/core'
import { useConnection, useConfig } from '@wagmi/vue'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'

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
  title: () => `${titleLabel.value} · punksmarket.app`,
  ogTitle: () => `${titleLabel.value} · punksmarket.app`,
  twitterTitle: () => `${titleLabel.value} · punksmarket.app`,
})

const { bids, refresh: refreshBids } = usePunksMarketBids({
  bidder: () => resolvedAddress.value ?? undefined,
})
const { events: activity } = useActivityFeed({
  address: () => resolvedAddress.value ?? undefined,
})

const {
  ids: owned,
  loading: ownedLoading,
  error: ownedError,
} = useOwnedPunks(() => resolvedAddress.value ?? undefined)

const { address: connectedAddress } = useConnection()

/// Resolved profile address only when the connected wallet matches — gates
/// the bulk-unwrap component so it only shows on the viewer's own profile.
const viewerOwnedAddress = computed<Address | null>(() => {
  const a = connectedAddress.value?.toLowerCase()
  const r = resolvedAddress.value?.toLowerCase()
  if (!a || !r || a !== r) return null
  return resolvedAddress.value
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

.profile-cols {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  min-height: 200px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.bid-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
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

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
