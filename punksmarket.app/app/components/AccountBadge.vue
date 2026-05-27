<template>
  <EvmAccount
    :address="address"
    resolve-ens
  >
    <template #default="{ display }">
      <span class="account-badge">
        <span
          class="dot"
          :style="{ background: dotColor }"
        />
        <span class="label">{{ display }}</span>
      </span>
    </template>
  </EvmAccount>
</template>

<script setup lang="ts">
import type { Address } from 'viem'

const props = defineProps<{
  address: Address
}>()

// Cheap deterministic color from address for the dot.
const dotColor = computed(() => `#${props.address.slice(2, 8)}`)
</script>

<style scoped>
.account-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--tag-background);
  box-shadow: var(--border-shadow);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.dot {
  width: 8px;
  height: 8px;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.label {
  max-width: 18ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
