import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useTransactionFlow } from '@1001-digital/components.evm'

/**
 * Wraps a `ContractWritePlan` in layers.evm `useTransactionFlow` so the
 * standard EvmTransactionFlowDialog (signing → waiting → complete) can drive it.
 */
export function usePunkTx(plan: Ref<ContractWritePlan | null>) {
  const { execute } = useWritePlan()

  const text = computed(() => {
    const description = plan.value?.description ?? 'Confirm transaction'
    return {
      title: { confirm: description },
      lead: { confirm: description },
    }
  })

  return useTransactionFlow({
    text,
    request: () => {
      const p = plan.value
      if (!p) throw new Error('No plan staged')
      return execute(p)
    },
    keepOpen: true,
  })
}
