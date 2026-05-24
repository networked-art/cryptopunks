<template>
  <div class="lot-card-shell">
    <a
      v-if="to"
      class="lot-card-link"
      :href="to"
      :aria-label="ariaLabel"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  to?: string
  ariaLabel?: string
}>()
</script>

<style scoped>
.lot-card-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  block-size: 100%;
}

.lot-card-link {
  position: absolute;
  inset: 0;
  z-index: 8;
  border: 0;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  text-decoration: none;
}

.lot-card-link:hover {
  color: inherit;
}

.lot-card-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: var(--size-1);
}

</style>
