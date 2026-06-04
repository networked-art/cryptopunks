export type AmountInput = bigint | number | string

export const WEI_PER_ETH = 1_000_000_000_000_000_000n

const ETH_USD_RAW_SCALE = 100_000_000n
const COMPACT_SCALE = 100n
const USD_COMPACT_DECIMALS = 2
const USD_COMPACT_THRESHOLD = 1_000_000n
const USD_COMPACT_UNITS = [
  { value: 1_000_000_000_000n, suffix: 'T' },
  { value: 1_000_000_000n, suffix: 'B' },
  { value: 1_000_000n, suffix: 'M' },
  { value: 1_000n, suffix: 'K' },
] as const
const MAX_COMPACT_USD = USD_COMPACT_UNITS[0].value * 1_000n

export function roundedUsdDollarsForWei(
  weiInput: AmountInput,
  ethUsdRawInput: AmountInput,
) {
  const wei = BigInt(weiInput)
  const ethUsdRaw = BigInt(ethUsdRawInput)
  const denominator = WEI_PER_ETH * ETH_USD_RAW_SCALE
  return (wei * ethUsdRaw + denominator / 2n) / denominator
}

export function roundedUsdDollarsForCents(centsInput: AmountInput) {
  return (BigInt(centsInput) + 50n) / 100n
}

export function formatUsdDollars(dollarsInput: AmountInput, compact = false) {
  const dollars = BigInt(dollarsInput)
  if (compact || dollars >= USD_COMPACT_THRESHOLD) {
    return formatCompactUsdDollars(dollars)
  }
  return formatFullUsdDollars(dollars)
}

export function formatFullUsdDollars(dollarsInput: AmountInput) {
  return `$${formatGroupedInteger(BigInt(dollarsInput))}`
}

export function formatCompactWhole(
  valueInput: AmountInput,
  unitInput: AmountInput,
) {
  const value = BigInt(valueInput)
  const unit = BigInt(unitInput)
  if (value >= unit * COMPACT_SCALE) return `${value / unit}`

  const scaled = (value * 10n + unit / 2n) / unit
  const whole = scaled / 10n
  const decimal = scaled % 10n
  return decimal === 0n ? `${whole}` : `${whole}.${decimal}`
}

function formatCompactUsdDollars(dollars: bigint) {
  if (dollars >= MAX_COMPACT_USD) return '>$999T'

  for (const unit of USD_COMPACT_UNITS) {
    if (dollars >= unit.value) {
      return `$${formatCompactFixed(dollars, unit.value, USD_COMPACT_DECIMALS)}${unit.suffix}`
    }
  }
  return formatFullUsdDollars(dollars)
}

function formatCompactFixed(
  valueInput: AmountInput,
  unitInput: AmountInput,
  decimals: number,
) {
  const value = BigInt(valueInput)
  const unit = BigInt(unitInput)
  const places = Math.max(0, Math.trunc(decimals))
  const scale = 10n ** BigInt(places)
  const scaled = (value * scale + unit / 2n) / unit
  const whole = scaled / scale
  const fraction = `${scaled % scale}`.padStart(places, '0')
  return places > 0 ? `${whole}.${fraction}` : `${whole}`
}

function formatGroupedInteger(value: bigint) {
  const raw = value.toString()
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
