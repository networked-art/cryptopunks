<template>
  <span
    class="eth-amount"
    :class="{ 'is-usd': mode === 'usd' }"
    :title="title"
  >
    <span class="value">{{ display }}</span>
    <span
      v-if="unit"
      class="unit"
      >{{ unit }}</span
    >
  </span>
</template>

<script setup lang="ts">
import { formatEther } from 'viem'
import {
  WEI_PER_ETH,
  formatCompactWhole,
  formatFullUsdDollars,
  formatUsdDollars,
  roundedUsdDollarsForCents,
  roundedUsdDollarsForWei,
} from '~/utils/priceDisplay'

const props = withDefaults(
  defineProps<{
    wei: bigint | number | string
    precision?: number
    symbol?: string
    compact?: boolean
    historical?: boolean
    historicalUsdCents?: bigint | number | string | null
  }>(),
  { precision: 4, symbol: 'Ξ', compact: false },
)

const { mode } = usePriceDisplayMode()
const { ethUSDRaw, fetchPriceOnce } = useEthUsdPriceFeed()

const wei = computed(() => BigInt(props.wei))
const value = computed(() => formatEther(wei.value))
const isUSD = computed(() => mode.value === 'usd')

if (import.meta.client) {
  watch(
    isUSD,
    (enabled) => {
      if (enabled) void fetchPriceOnce()
    },
    { immediate: true },
  )
}

const display = computed(() => {
  if (isUSD.value) return usdDisplay.value
  if (props.compact) return formatCompactEther(wei.value, props.precision)

  const n = Number(value.value)
  if (!Number.isFinite(n)) return value.value
  if (n === 0) return '0'
  if (n >= 1_000_000) return formatCompactEther(wei.value, props.precision)
  const decimals = n >= 1000 ? 0 : n >= 1 ? 2 : props.precision
  return formatETH(n, decimals)
})

const unit = computed(() => (isUSD.value ? '' : props.symbol))

const historicalUsdCents = computed(() =>
  props.historicalUsdCents == null ? null : BigInt(props.historicalUsdCents),
)
const historicalUsdDollars = computed(() =>
  historicalUsdCents.value == null
    ? null
    : roundedUsdDollarsForCents(historicalUsdCents.value),
)
const currentUsdDollars = computed(() =>
  ethUSDRaw.value && ethUSDRaw.value > 0n
    ? roundedUsdDollarsForWei(wei.value, ethUSDRaw.value)
    : null,
)
const usdDollars = computed(() =>
  props.historical ? historicalUsdDollars.value : currentUsdDollars.value,
)
const usdDisplay = computed(() =>
  usdDollars.value == null
    ? '—'
    : formatUsdDollars(usdDollars.value, props.compact),
)

const title = computed(() => {
  if (!isUSD.value) return `${value.value} ETH`

  const eth = `${value.value} ETH`
  if (props.historical) {
    const historical =
      historicalUsdDollars.value == null
        ? 'Historical USD unavailable'
        : `Historical value: ${formatFullUsdDollars(
            historicalUsdDollars.value,
          )}`
    const current =
      currentUsdDollars.value == null
        ? 'Current value unavailable'
        : `Current value: ${formatFullUsdDollars(currentUsdDollars.value)}`
    return `${historical} · ${current} · ${eth}`
  }

  if (currentUsdDollars.value == null) return `ETH/USD unavailable · ${eth}`
  return `Current value: ${formatFullUsdDollars(currentUsdDollars.value)} · ${eth}`
})

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
</style>
