<template>
  <NuxtLink
    class="offer-card"
    :to="detailHref"
    :aria-label="`View offer ${offer.id}`"
  >
    <OfferCardTarget :target="target" />
    <OfferCardAmount
      :wei="offer.amountWei"
      :offerer="offer.offerer"
    />
  </NuxtLink>
</template>

<script setup lang="ts">
import type { OfferRecord } from '~/utils/auction'

defineOptions({ name: 'OfferCard' })

const props = defineProps<{ offer: OfferRecord }>()

const { detailHref, target } = useOfferCard(() => props.offer)
</script>

<style scoped>
.offer-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-4);
  min-width: 0;
  padding: var(--size-3) var(--size-4);
  color: inherit;
  border: 0;
  background: white;
  text-decoration: none;
  transition: box-shadow 120ms ease;
}

.offer-card + .offer-card {
  border-top: var(--border);
}

.offer-card:hover,
.offer-card:focus-visible {
  color: inherit;
  background: white;
  box-shadow: inset 2px 0 0 var(--accent);
}

.offer-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: var(--size-1);
}
</style>
