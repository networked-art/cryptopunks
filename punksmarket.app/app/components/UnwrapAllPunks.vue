<template>
  <div
    v-if="wrappedOwned.length"
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

  <EvmTransactionFlowDialog
    ref="dialogRef"
    chain="mainnet"
    :text="dialogText"
    keep-open
    skip-confirmation
    @complete="onComplete"
  />
</template>

<script setup lang="ts">
import { type Address, type Hash, type TransactionReceipt } from 'viem'

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
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)

const approveText = {
  title: { confirm: 'Approve unwrap helper', waiting: 'Approving helper…' },
  lead: {
    confirm:
      'One-time approval so unwrap.punksmarket.eth can burn wrapper tokens on your behalf.',
  },
}
const unwrapText = computed(() => {
  const n = batchIds.length || wrappedOwned.value.length
  return {
    title: {
      confirm: `Unwrap ${n} punks`,
      waiting: `Unwrapping ${n} punks…`,
    },
    lead: {
      confirm: `Releasing ${n} wrapped C̙ͦ͌ͣ̀ry̰͔̹̓̋̂pṫ̠͜ó̩͓Pͬ̋ù̓̽̂ͥ͟͝n_̹̜̳ͭ̀k͇̤̲̼͈̼̍s̸̨̗̍̀̎ in a single transaction.`,
    },
  }
})
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})

/// Snapshot the wrapped ids at the moment of the click. `wrappedOwned` may
/// shift between approval and unwrap as other tabs / the indexer catch up,
/// and the batch should match what the user agreed to.
let batchIds: number[] = []

function start() {
  if (wrappedOwned.value.length === 0) return
  batchIds = [...wrappedOwned.value]
  if (!isApproved.value) {
    dialogText.value = approveText
    dialogRef.value?.initializeRequest(() =>
      execute(sdk.value.v1Wrapper.prepareApproveBatchUnwrap()),
    )
  } else {
    dialogText.value = unwrapText.value
    dialogRef.value?.initializeRequest(() =>
      execute(sdk.value.v1Wrapper.prepareUnwrapBatch(batchIds)),
    )
  }
}

function onComplete(_receipt: TransactionReceipt) {
  if (!isApproved.value) {
    /// Approval confirmed — chain straight into the unwrap signature so the
    /// user only clicks once. `keep-open` keeps the dialog mounted across
    /// the two phases.
    isApproved.value = true
    dialogText.value = unwrapText.value
    dialogRef.value?.initializeRequest(() =>
      execute(sdk.value.v1Wrapper.prepareUnwrapBatch(batchIds)),
    )
  } else {
    markUnwrapped(batchIds)
  }
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
