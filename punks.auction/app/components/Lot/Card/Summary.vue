<template>
  <div class="lot-card-summary">
    <div class="summary-subject">
      <span class="summary-subject-text">
        <slot>{{ label }}</slot>
      </span>
    </div>

    <div class="summary-meta">
      <span
        v-if="detail"
        class="summary-detail"
      >
        <span
          v-if="liveIndicator"
          class="summary-live-indicator"
          aria-hidden="true"
        />
        <span
          v-if="liveIndicator"
          class="summary-live-label"
          >Live auction,
        </span>
        {{ detail }}
      </span>
      <span
        v-if="detail"
        aria-hidden="true"
        >&middot;</span
      >
      <EthAmount
        class="summary-amount"
        :wei="wei"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string
  detail?: string
  liveIndicator?: boolean
  wei: bigint | number | string
}>()
</script>

<style scoped>
.lot-card-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-4);
  min-width: 0;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.summary-subject,
.summary-meta {
  min-width: 0;
  color: var(--text-muted);
  white-space: nowrap;
}

.summary-subject {
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-subject-text {
  position: relative;
  display: inline-block;
  padding-block-end: var(--size-1);
}

.summary-subject-text::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: 2px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.summary-meta {
  display: inline-flex;
  align-items: baseline;
  justify-content: end;
  gap: var(--size-2);
  text-align: right;
}

.summary-detail {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2);
}

.summary-live-indicator {
  position: relative;
  inline-size: 0.36rem;
  block-size: 0.36rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-strong);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.summary-live-label {
  position: absolute;
  overflow: hidden;
  clip: rect(0 0 0 0);
  inline-size: 1px;
  block-size: 1px;
  white-space: nowrap;
}

.summary-amount,
.summary-amount :deep(.unit) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
</style>
