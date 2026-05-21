import type { Address } from 'viem'
import { readEscrowBalance } from '~/utils/auction'

/**
 * ETH credited to `account` in the `PunksAuction` pull-payment escrow —
 * outbid refunds and sale proceeds that a direct send failed to deliver,
 * claimable via the contract's `withdraw`.
 */
export function useEscrowBalance(
  account: MaybeRefOrGetter<Address | undefined>,
) {
  const client = useReadClient()

  const balance = ref<bigint>(0n)
  const pending = ref(false)

  async function load() {
    const a = toValue(account)
    const c = client.value
    if (!a || !c) {
      balance.value = 0n
      return
    }
    pending.value = true
    try {
      balance.value = await readEscrowBalance(c, a)
    } catch {
      balance.value = 0n
    } finally {
      pending.value = false
    }
  }

  watch([() => toValue(account), client], () => void load(), {
    immediate: true,
  })

  return { balance, pending, refresh: load }
}
