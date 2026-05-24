<template>
  <div class="lot-card-summary">
    <div class="summary-subject">
      <slot>{{ label }}</slot>
    </div>

    <div class="summary-meta">
      <span v-if="detail">{{ detail }}</span>
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
  font-size: var(--font-base);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: var(--line-height-snug);
}

.summary-subject,
.summary-meta {
  min-width: 0;
  color: var(--text-dim);
  white-space: nowrap;
}

.summary-subject {
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-meta {
  display: inline-flex;
  align-items: baseline;
  justify-content: end;
  gap: var(--size-2);
  text-align: right;
}

.summary-amount,
.summary-amount :deep(.unit) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
</style>
