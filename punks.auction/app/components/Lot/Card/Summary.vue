<template>
  <div class="lot-card-summary">
    <div class="summary-copy">
      <div class="summary-label">
        <span class="eyebrow">{{ label }}</span>
        <span
          v-if="live"
          class="live-status"
        >
          <span
            class="live-dot"
            aria-hidden="true"
          />
          Live
        </span>
      </div>
      <div
        v-if="$slots.default"
        class="summary-meta"
      >
        <slot />
      </div>
    </div>

    <EthAmount
      class="summary-amount"
      :wei="wei"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  wei: bigint | number | string
  live?: boolean
}>()
</script>

<style scoped>
.lot-card-summary {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--size-3);
  min-width: 0;
}

.summary-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.summary-label {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--size-2);
}

.live-status {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  color: var(--accent-strong);
  font-size: var(--font-xs);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  white-space: nowrap;
}

.live-dot {
  inline-size: var(--size-1);
  block-size: var(--size-1);
  border-radius: var(--radius-sm);
  background: currentColor;
  animation: live-pulse calc(var(--speed-slow) + var(--speed-slow)) ease-in-out
    infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}

.summary-meta {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}

.summary-amount {
  flex-shrink: 0;
  color: var(--text);
  font-size: var(--font-2xl);
  font-weight: var(--font-weight-bolder);
  line-height: 1;
}
</style>
