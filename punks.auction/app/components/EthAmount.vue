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
    compact?: boolean
  }>(),
  { precision: 4, symbol: 'Ξ', compact: false },
)

const wei = computed(() => BigInt(props.wei))
const value = computed(() => formatEther(wei.value))

const display = computed(() => {
  if (props.compact) return formatCompactEther(wei.value, props.precision)

  const n = Number(value.value)
  if (!Number.isFinite(n)) return value.value
  if (n === 0) return '0'
  if (n >= 1_000_000) return formatCompactEther(wei.value, props.precision)
  const decimals = n >= 1000 ? 0 : n >= 1 ? 2 : props.precision
  return formatETH(n, decimals)
})

const WEI_PER_ETH = 1_000_000_000_000_000_000n
const COMPACT_SCALE = 100n
const COMPACT_UNITS = [
  { value: 1_000_000_000_000n, suffix: 'T' },
  { value: 1_000_000_000n, suffix: 'B' },
  { value: 1_000_000n, suffix: 'M' },
  { value: 1_000n, suffix: 'K' },
] as const
const MAX_COMPACT_ETH = COMPACT_UNITS[0].value * 1_000n

function formatCompactEther(wei: bigint, precision: number) {
  const wholeEth = wei / WEI_PER_ETH
  if (wholeEth >= MAX_COMPACT_ETH) return '>999T'

  for (const unit of COMPACT_UNITS) {
    if (wholeEth >= unit.value) {
      return `${formatCompactWhole(wholeEth, unit.value)}${unit.suffix}`
    }
  }
  return formatRoundedEther(wei, precision)
}

function formatCompactWhole(value: bigint, unit: bigint) {
  if (value >= unit * COMPACT_SCALE) return `${value / unit}`

  const scaled = (value * 10n + unit / 2n) / unit
  const whole = scaled / 10n
  const decimal = scaled % 10n
  return decimal === 0n ? `${whole}` : `${whole}.${decimal}`
}

function formatRoundedEther(wei: bigint, precision: number) {
  if (wei === 0n) return '0'

  const digits = normalizePrecision(precision)
  const scale = 10n ** BigInt(digits)
  const scaled = (wei * scale + WEI_PER_ETH / 2n) / WEI_PER_ETH
  if (scaled === 0n) return `<${smallestDisplayValue(digits)}`

  const whole = scaled / scale
  if (digits === 0) return `${whole}`

  const fraction = `${scaled % scale}`.padStart(digits, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

function normalizePrecision(precision: number) {
  if (!Number.isFinite(precision)) return 0
  return Math.min(18, Math.max(0, Math.trunc(precision)))
}

function smallestDisplayValue(precision: number) {
  if (precision === 0) return '1'
  return `0.${'0'.repeat(precision - 1)}1`
}
</script>

<style scoped>
.eth-amount {
  display: inline-flex;
  align-items: baseline;
  gap: var(--size-1);
  font-variant-numeric: tabular-nums;
}

.unit {
  color: var(--text-dim);
  font-size: 0.85em;
}
</style>
