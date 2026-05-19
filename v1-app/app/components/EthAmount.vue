<template>
  <span
    class="eth-amount"
    :title="`${value} ETH`"
  >
    <span class="value">{{ display }}</span>
    <span class="unit">{{ symbol }}</span>
  </span>
</template>

<script setup lang="ts">
import { formatEther } from 'viem'

const props = withDefaults(
  defineProps<{
    wei: bigint | number | string
    precision?: number
    symbol?: string
  }>(),
  { precision: 4, symbol: 'Ξ' },
)

const value = computed(() => formatEther(BigInt(props.wei)))

const display = computed(() => {
  const n = Number(value.value)
  if (!Number.isFinite(n)) return value.value
  if (n === 0) return '0'
  const decimals = n >= 1000 ? 0 : n >= 1 ? 2 : props.precision
  return formatETH(n, decimals)
})
</script>

<style scoped>
.eth-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.unit {
  color: var(--text-dim);
  font-size: 0.85em;
}
</style>
