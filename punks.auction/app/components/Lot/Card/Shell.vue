<template>
  <div
    class="lot-card-shell"
    :class="{ 'lot-card-shell-lift': lift }"
  >
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
  lift?: boolean
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
  max-width: 19rem;
}

.lot-card-shell-lift {
  transition: transform var(--speed) ease;
}

.lot-card-shell-lift:hover,
.lot-card-shell-lift:focus-within {
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .lot-card-shell-lift {
    transition: none;
  }

  .lot-card-shell-lift:hover,
  .lot-card-shell-lift:focus-within {
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

.lot-card-shell:not(.lot-card-shell-lift) :deep(.lot-preview) {
  box-shadow: none;
}

.lot-card-shell-lift:hover :deep(.lot-preview),
.lot-card-shell-lift:focus-within :deep(.lot-preview) {
  box-shadow: var(--shadow-2, 0 10px 24px rgb(10 10 18 / 12%));
}
</style>
