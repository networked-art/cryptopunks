<template>
  <NuxtLink
    v-if="to"
    class="offer-item-shell"
    :to="to"
    :aria-label="ariaLabel"
  >
    <slot />
  </NuxtLink>
  <div
    v-else
    class="offer-item-shell"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  to?: RouteLocationRaw
  ariaLabel?: string
}>()
</script>

<style scoped>
.offer-item-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-4);
  min-width: 0;
  padding: 0 var(--size-4) 0 0;
  color: inherit;
  border: 0;
  background: white;
  text-decoration: none;
  transition: box-shadow 120ms ease;
}

.offer-item-shell + .offer-item-shell {
  border-top: var(--border);
}

.offer-item-shell:hover,
.offer-item-shell:focus-visible {
  color: inherit;
  background: white;
  box-shadow: inset 2px 0 0 var(--accent);
}

.offer-item-shell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: var(--size-1);
}
</style>
