<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="offers-tab"
    >
      <section class="offers-section">
        <header class="section-head">
          <h2 class="section-title eyebrow">Made by me</h2>
          <Button
            class="small icon-button"
            :disabled="offersPending"
            @click="refreshOffers"
          >
            <Icon name="lucide:refresh-cw" />
            <span>Refresh</span>
          </Button>
        </header>

        <p
          v-if="!madeByMe.length"
          class="muted empty"
        >
          You have no open purchase offers.
        </p>
        <ul
          v-else
          class="offer-list"
        >
          <li
            v-for="offer in madeByMe"
            :key="String(offer.id)"
            class="offer-row"
          >
            <LazyOfferCard
              :offer="offer"
              :displayed-offerer-addresses="ownerAddressList"
            />
          </li>
        </ul>
      </section>

      <section class="offers-section">
        <h2 class="section-title eyebrow">Received on my punks</h2>

        <p
          v-if="!received.length"
          class="muted empty"
        >
          No standing offers target Punks you hold.
        </p>
        <ul
          v-else
          class="offer-list"
        >
          <li
            v-for="offer in received"
            :key="String(offer.id)"
            class="offer-row"
          >
            <LazyOfferCard
              :offer="offer"
              :displayed-offerer-addresses="ownerAddressList"
            />
          </li>
        </ul>
      </section>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { offerSlotMatchingIds } from '~/utils/auction'

useOwnProfileGuard()

const { ownAccount, resolvedAddress, vault, stash } = useProfileContext()
const profileAddress = computed(() => resolvedAddress.value ?? undefined)

const { offers, pending: offersPending, refresh: refreshOffers } = useOffers()

const { ids: owned } = useAccountPunks({
  account: profileAddress,
  vault,
  stash,
})

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

const ownerAddressList = computed(() => [...ownerAddresses.value])

const madeByMe = computed(() => {
  const addrs = ownerAddresses.value
  if (!addrs.size) return []
  return offers.value.filter((offer) => addrs.has(offer.offerer.toLowerCase()))
})

const { searchCriteriaMatches } = useOfferSlotMatching()

const ownedSet = computed(() => new Set(owned.value))
const made = computed(() => new Set(madeByMe.value.map((o) => String(o.id))))
const received = computed(() => {
  const ids = ownedSet.value
  if (!ids.size) return []
  return offers.value.filter((offer) => {
    if (made.value.has(String(offer.id))) return false
    return offer.slots.some((slot) => {
      const matches = offerSlotMatchingIds(slot, searchCriteriaMatches(slot))
      return matches.some((id) => ids.has(id))
    })
  })
})
</script>

<style scoped>
.offers-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.offers-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
}

.section-title {
  margin: 0;
}

.empty {
  padding: var(--size-4);
  border: var(--border);
  text-align: center;
  font-size: var(--font-sm);
}

.offer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

.offer-row {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  min-width: 0;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
}
</style>
