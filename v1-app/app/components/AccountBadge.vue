<template>
  <span class="account-badge">
    <span
      class="dot"
      :style="{ background: dotColor }"
    />
    <span class="label">{{ displayName }}</span>
  </span>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { shortAddress } from '@1001-digital/components.evm'

const props = defineProps<{
  address: Address
}>()

const { data } = useEnsWithAvatar(() => props.address)

const displayName = computed(
  () => data.value?.ens || shortAddress(props.address),
)

// Cheap deterministic color from address for the dot.
const dotColor = computed(() => {
  const hex = props.address.slice(2, 8)
  return `#${hex}`
})
</script>

<style scoped>
.account-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 99px;
  background: var(--bg-elevated);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

.label {
  max-width: 18ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
