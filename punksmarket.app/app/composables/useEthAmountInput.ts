import { parseEther } from 'viem'

export function normalizeEthAmountInput(input: unknown): string {
  return String(input ?? '').replaceAll(',', '.')
}

export function parseEthAmountInput(input: unknown): bigint | null {
  const normalized = normalizeEthAmountInput(input).trim()
  if (!normalized) return null
  try {
    const wei = parseEther(normalized)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

export function useEthAmountInput(initialValue = '') {
  const input = ref(normalizeEthAmountInput(initialValue))

  const amount = computed<string>({
    get: () => input.value,
    set: (value) => {
      input.value = normalizeEthAmountInput(value)
    },
  })

  const wei = computed(() => parseEthAmountInput(input.value))

  return { amount, wei }
}
