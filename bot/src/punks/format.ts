import { formatEther } from 'viem'

/// An ether amount as `Ξ50`, `Ξ1.23`, `Ξ0.0042` — fewer decimals as the number
/// grows, trailing zeros trimmed, so tweet copy stays tight.
export function formatEth(wei: bigint): string {
  const eth = Number(formatEther(wei))
  const fixed =
    eth >= 100 ? eth.toFixed(0) : eth >= 1 ? eth.toFixed(2) : eth.toFixed(4)
  return `Ξ${trimZeros(fixed)}`
}

/// A USD-cents integer as `$120,000` (whole dollars — cents are noise at these
/// amounts).
export function formatUsd(cents: bigint): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100)
}

export function shortenAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}
