<template>
  <Card class="lot-card">
    <div class="card-head">
      <span class="card-id">Lot #{{ lot.id }}</span>
      <Tag
        v-if="isPrivate"
        small
        >Private</Tag
      >
    </div>

    <LotItems
      :items="lot.items"
      :size="52"
    />

    <dl class="facts">
      <div class="fact">
        <dt>Reserve</dt>
        <dd>
          <EthAmount :wei="lot.reserveWei" />
        </dd>
      </div>
      <div class="fact">
        <dt>Seller</dt>
        <dd>
          <NuxtLink :to="`/profile/${lot.seller}`">
            <Account :address="lot.seller" />
          </NuxtLink>
        </dd>
      </div>
      <div
        v-if="isPrivate"
        class="fact"
      >
        <dt>Buyer</dt>
        <dd>
          <NuxtLink :to="`/profile/${lot.onlySellTo}`">
            <Account :address="lot.onlySellTo" />
          </NuxtLink>
        </dd>
      </div>
    </dl>

    <p class="muted note">
      Open for auction — the first bid at or above the reserve starts a 24-hour
      auction.
    </p>
  </Card>
</template>

<script setup lang="ts">
import { ZERO_ADDRESS } from '@networked-art/punks-sdk'
import type { LotRecord } from '~/utils/auction'

defineOptions({ name: 'LotCard' })

const props = defineProps<{ lot: LotRecord }>()

const isPrivate = computed(
  () => props.lot.onlySellTo.toLowerCase() !== ZERO_ADDRESS.toLowerCase(),
)
</script>

<style scoped>
.lot-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
}

.card-id {
  font-size: 13px;
  font-weight: 500;
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--size-4);
  row-gap: var(--size-1);
  font-size: 12px;
}

.fact {
  display: contents;
}

.fact dt {
  color: var(--text-dim);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  align-self: center;
}

.fact dd {
  margin: 0;
}

.note {
  font-size: 11px;
  margin: 0;
}
</style>
