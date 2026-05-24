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
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  block-size: 100%;
  transition: transform 180ms ease;
}

.lot-card-shell:hover,
.lot-card-shell:focus-within {
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .lot-card-shell {
    transition: none;
  }

  .lot-card-shell:hover,
  .lot-card-shell:focus-within {
    transform: none;
  }
}

.lot-card-link {
  position: absolute;
  inset: 0;
  z-index: 8;
  border: 0;
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

.lot-card-shell:hover :deep(.summary-subject-text),
.lot-card-shell:focus-within :deep(.summary-subject-text) {
  color: var(--text);
}

.lot-card-shell:hover :deep(.summary-subject-text::after),
.lot-card-shell:focus-within :deep(.summary-subject-text::after) {
  opacity: 1;
}

.lot-card-shell:hover :deep(.lot-preview),
.lot-card-shell:focus-within :deep(.lot-preview) {
  box-shadow: var(--shadow-2, 0 10px 24px rgb(10 10 18 / 12%));
}
</style>
