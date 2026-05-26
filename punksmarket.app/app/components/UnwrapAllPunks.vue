<template>
  <div
    v-if="wrappedOwned.length > 1"
    class="bulk-unwrap"
  >
    <p class="lead">
      You hold {{ wrappedOwned.length }} wrapped C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎. Unwrap them to
      own the actual token (currently the token is owned by the wrapper), to
      list, transfer, or accept bids.
    </p>
    <div class="cta-row">
      <Button
        class="primary"
        :disabled="approvalPending"
        @click="start"
      >
        Unwrap all ({{ wrappedOwned.length }})
      </Button>
      <span
        v-if="!isApproved && !approvalPending"
        class="hint"
      >
        First time? Two signatures: a one-time approval to
        <a
          href="https://evm.now/address/0x6d263b22d1b2feb93881af6ff57666efa5a8f346/code"
          target="_blank"
          >UnwrapV1Punks.sol</a
        >, then the batch.
      </span>
    </div>
  </div>

  <EvmMultiTransactionFlowDialog
    ref="dialogRef"
    title="Unwrap Punks"
    :steps="flowSteps"
    :text="dialogText"
    skip-confirmation
    @complete="onComplete"
  />
</template>

<script setup lang="ts">
import type {
  MultiTransactionFlowStep,
  MultiTransactionFlowText,
} from '~/types/transactionFlow'
import { type Address, type TransactionReceipt } from 'viem'

const props = defineProps<{
  owner: Address
  owned: number[]
}>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { isWrapped, markUnwrapped } = useWrappedPunks()

const wrappedOwned = computed(() => props.owned.filter((id) => isWrapped(id)))

const isApproved = ref(false)
const approvalPending = ref(true)

async function refreshApproval() {
  approvalPending.value = true
  try {
    isApproved.value = await sdk.value.v1Wrapper.isBatchUnwrapApproved(
      props.owner,
    )
  } catch {
    isApproved.value = false
  } finally {
    approvalPending.value = false
  }
}

watchEffect(refreshApproval)

// ─── Dialog wiring ────────────────────────────────────────────────────────────

type DialogRef = {
  start: () => void
} | null
const dialogRef = ref<DialogRef>(null)
const flowSteps = ref<MultiTransactionFlowStep[]>([])
const dialogText: MultiTransactionFlowText = {
  title: { complete: 'Unwrap complete' },
  lead: { complete: 'Wrapped punks were unwrapped.' },
}

/// Snapshot the wrapped ids at the moment of the click. `wrappedOwned` may
/// shift between approval and unwrap as other tabs / the indexer catch up,
/// and the batch should match what the user agreed to.
let batchIds: number[] = []

async function start() {
  if (wrappedOwned.value.length === 0) return
  batchIds = [...wrappedOwned.value]
  flowSteps.value = createUnwrapSteps()
  await nextTick()
  dialogRef.value?.start()
}

function createUnwrapSteps(): MultiTransactionFlowStep[] {
  const n = batchIds.length

  return [
    {
      id: 'approve-unwrap-helper',
      title: 'Approve unwrap helper',
      lead: 'One-time approval so unwrap.punksmarket.eth can unwrap multiple wrapper tokens in a single transaction.',
      action: 'Approve helper',
      skip: () => isApproved.value,
      request: () => execute(sdk.value.v1Wrapper.prepareApproveBatchUnwrap()),
      result: () => {
        isApproved.value = true
      },
    },
    {
      id: 'unwrap-batch',
      title: `Unwrap ${n} punks`,
      lead: `Releasing ${n} wrapped C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ in a single transaction.`,
      action: 'Unwrap',
      request: () => execute(sdk.value.v1Wrapper.prepareUnwrapBatch(batchIds)),
    },
  ]
}

function onComplete(_receipts: TransactionReceipt[]) {
  markUnwrapped(batchIds)
  void refreshApproval()
}
</script>

<style scoped>
.bulk-unwrap {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-3);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.lead {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.cta-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.hint {
  font-size: 11px;
  color: var(--text-dim);
}
</style>
