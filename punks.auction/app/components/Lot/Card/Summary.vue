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
        <LivenessIndicator
          v-if="liveIndicator"
          label="Live auction,"
        />
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
}

.summary-subject-text::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  inset-block-end: calc(-1 * var(--size-1));
  block-size: 2px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.summary-meta {
  display: inline-flex;
  align-items: center;
  justify-content: end;
  gap: var(--size-2);
  text-align: right;
}

.summary-detail {
  display: inline-flex;
  align-items: center;
}

.summary-detail :deep(.liveness-indicator) {
  margin-inline-end: var(--size-1);
  vertical-align: 0.1em;
}

.summary-amount,
.summary-amount :deep(.unit) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
</style>
