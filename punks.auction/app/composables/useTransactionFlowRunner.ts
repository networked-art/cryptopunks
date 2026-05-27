import type {
  MultiTransactionFlowStep,
  MultiTransactionFlowText,
  TransactionFlowText,
} from '~/types/transactionFlow'
import { transactionTitleForPlan } from '~/utils/transactionFlowText'
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import type { Hash, TransactionReceipt } from 'viem'

type TransactionDialogRef = {
  initializeRequest: () => void
} | null

type MultiDialogRef = {
  start: () => void
} | null

type TransactionFlowRunnerText = {
  single?: TransactionFlowText
  multi?: MultiTransactionFlowText
  dialogTitle?: string
}

type TransactionFlowRunnerErrorSource = 'prepare' | 'transaction'

export function useTransactionFlowRunner(
  opts: {
    onComplete?: (tx: Hash) => void
    onError?: (
      message: string,
      source: TransactionFlowRunnerErrorSource,
    ) => void
  } = {},
) {
  const { execute } = useWritePlan()

  const pending = ref(false)
  const error = ref<string | null>(null)
  const transactionDialogRef = ref<TransactionDialogRef>(null)
  const multiDialogRef = ref<MultiDialogRef>(null)
  const transactionRequest = ref<(() => Promise<Hash>) | undefined>()
  const transactionText = ref<TransactionFlowText>({})
  const flowSteps = ref<MultiTransactionFlowStep[]>([])
  const multiDialogText = ref<MultiTransactionFlowText>({})
  const multiDialogTitle = ref('Transactions')

  async function runPlan(
    planInput: ContractWritePlan | Promise<ContractWritePlan>,
    text: TransactionFlowText = {},
  ) {
    await runPlans(
      Promise.resolve(planInput).then((plan) => [plan]),
      {
        single: text,
      },
    )
  }

  async function runPlans(
    plansInput:
      | readonly ContractWritePlan[]
      | Promise<readonly ContractWritePlan[]>,
    text: TransactionFlowRunnerText = {},
  ) {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      const plans = await plansInput
      if (!plans.length) throw new Error('No transaction steps to execute.')

      if (plans.length === 1) {
        transactionRequest.value = () => execute(plans[0]!)
        transactionText.value = textForPlan(plans[0]!, text.single)
        await nextTick()
        transactionDialogRef.value?.initializeRequest()
        return
      }

      flowSteps.value = plans.map((plan, index) => stepFromPlan(plan, index))
      multiDialogTitle.value = text.dialogTitle ?? 'Transactions'
      multiDialogText.value = text.multi ?? {
        title: { complete: 'Transactions complete' },
        lead: { complete: 'All transactions were confirmed.' },
      }
      await nextTick()
      multiDialogRef.value?.start()
    } catch (e) {
      const message = (e as Error).message
      error.value = message
      opts.onError?.(message, 'prepare')
    } finally {
      pending.value = false
    }
  }

  function stepFromPlan(
    plan: ContractWritePlan,
    index: number,
  ): MultiTransactionFlowStep {
    return {
      id: `tx-${index}`,
      title: transactionTitleForPlan(plan),
      lead: plan.description,
      request: () => execute(plan),
    }
  }

  function onTransactionComplete(receipt: TransactionReceipt) {
    opts.onComplete?.(receipt.transactionHash as Hash)
  }

  function onMultiTransactionComplete(receipts: TransactionReceipt[]) {
    const lastReceipt = receipts.at(-1)
    if (lastReceipt) opts.onComplete?.(lastReceipt.transactionHash as Hash)
  }

  function onFlowError(message: string) {
    error.value = message
    opts.onError?.(message, 'transaction')
  }

  return {
    pending,
    error,
    transactionDialogRef,
    transactionRequest,
    transactionText,
    multiDialogRef,
    flowSteps,
    multiDialogText,
    multiDialogTitle,
    runPlan,
    runPlans,
    onTransactionComplete,
    onMultiTransactionComplete,
    onFlowError,
  }
}

function textForPlan(
  plan: ContractWritePlan,
  text: TransactionFlowText = {},
): TransactionFlowText {
  const compactTitle = transactionTitleForPlan(plan)
  // Caller's confirm title (if any) wins across all phases — prevents the
  // wallet round-trip from flipping back to the compact label mid-flow.
  const sharedTitle = text.title?.confirm ?? compactTitle
  return {
    ...text,
    title: {
      confirm: compactTitle,
      requesting: sharedTitle,
      waiting: sharedTitle,
      complete: 'Transaction complete',
      ...text.title,
    },
    lead: {
      confirm: plan.description,
      requesting: plan.description,
      waiting: plan.description,
      complete: 'Transaction confirmed.',
      ...text.lead,
    },
  }
}
