<template>
  <span class="offer-amount">
    <EthAmount
      class="amount-value"
      :wei="wei"
    />
    <span class="offerer">
      <Account
        :address="offerer"
        :image-size="16"
      />
    </span>
  </span>
</template>

<script setup lang="ts">
import type { Address } from 'viem'

defineProps<{
  wei: bigint | number | string
  offerer: Address
}>()
</script>

<style scoped>
.offer-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--size-1);
  min-width: max-content;
}

.amount-value,
.amount-value :deep(.unit) {
  color: var(--text);
  font-size: var(--font-md);
  white-space: nowrap;
}

.offerer {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--size-1);
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.offerer :deep(.avvatar) {
  height: 1em;
  margin-right: 0;
}
</style>
