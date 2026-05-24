<template>
  <div class="lot-card-summary">
    <div class="summary-copy">
      <div
        v-if="label || $slots.label"
        class="summary-kicker"
      >
        <span
          v-if="labelStatus"
          class="summary-status"
          :class="{ live: labelStatusLive }"
        >
          <span
            v-if="labelStatusLive"
            class="live-dot"
            aria-hidden="true"
          />
          {{ labelStatus }}
        </span>
        <span class="summary-kicker-text">
          <slot name="label">{{ label }}</slot>
        </span>
      </div>
      <div
        v-if="$slots.default"
        class="summary-meta"
      >
        <slot />
      </div>
    </div>

    <div class="summary-value">
      <div
        v-if="amountLabel"
        class="amount-kicker"
        :class="{ live: amountLive }"
      >
        <span
          v-if="amountLive"
          class="live-dot"
          aria-hidden="true"
        />
        {{ amountLabel }}
      </div>
      <EthAmount
        class="summary-amount"
        :wei="wei"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  wei: bigint | number | string
  labelStatus?: string
  labelStatusLive?: boolean
  amountLabel?: string
  amountLive?: boolean
}>()
</script>

<style scoped>
.lot-card-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: end;
  gap: var(--size-4);
  min-width: 0;
}

.summary-copy {
  display: grid;
  gap: var(--size-2);
  min-width: 0;
}

.summary-kicker,
.summary-status,
.amount-kicker {
  color: var(--text-dim);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0;
  line-height: var(--line-height-tight);
}

.summary-kicker {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  text-transform: uppercase;
  white-space: nowrap;
}

.summary-kicker-text {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.summary-status {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  flex-shrink: 0;
}

.summary-status.live {
  color: var(--accent-strong);
}

.summary-value {
  display: grid;
  justify-items: end;
  gap: var(--size-1);
  text-align: right;
}

.amount-kicker {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  text-transform: uppercase;
  white-space: nowrap;
}

.amount-kicker.live {
  color: var(--accent-strong);
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
  line-height: var(--line-height-tight);
}

.summary-amount {
  color: var(--text);
  font-size: var(--font-xl);
  font-weight: var(--font-weight-bolder);
  line-height: var(--line-height-tight);
  white-space: nowrap;
}
</style>
