<template>
  <ClientOnly>
    <section class="clear-form">
      <h2 class="block-title eyebrow">Clear stale lots</h2>

      <label class="field">
        <span class="label">Lot ids</span>
        <input
          v-model="idsText"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div
        v-if="!address"
        class="connect-row"
      >
        <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
        <span class="muted">Connect a wallet to clear stale lots.</span>
      </div>

      <Button
        v-else
        :disabled="!canClear"
        @click="actClear"
      >
        Clear stale lots
      </Button>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        chain="mainnet"
        :text="dialogText"
        keep-open
        skip-confirmation
        @complete="onComplete"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { ContractWritePlan } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import type { Hash, TransactionReceipt } from 'viem'

const emit = defineEmits<{ cleared: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const idsText = ref('')
const error = ref<string | null>(null)
const ids = computed(() => parseLotIds(idsText.value))
const canClear = computed(() => ids.value.length > 0)

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})

function actClear() {
  error.value = null
  if (!ids.value.length) return

  let plan: ContractWritePlan
  try {
    plan = sdk.value.auctions.prepareClearStaleLots(ids.value)
  } catch (e) {
    error.value = (e as Error).message
    return
  }

  dialogText.value = {
    title: { confirm: 'Clear stale lots', waiting: 'Clear stale lots' },
    lead: { confirm: plan.description },
    action: { confirm: 'Clear lots' },
  }
  dialogRef.value?.initializeRequest(() => execute(plan))
}

function onComplete(receipt: TransactionReceipt) {
  idsText.value = ''
  emit('cleared', receipt.transactionHash as Hash)
}

function parseLotIds(input: string): number[] {
  const seen = new Set<number>()
  for (const part of input.split(/[,\s]+/)) {
    const id = Number(part.trim())
    if (Number.isInteger(id) && id >= 1) seen.add(id)
  }
  return [...seen]
}
</script>

<style scoped>
.clear-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.block-title,
.error {
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.field input {
  width: 100%;
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
  font-size: var(--font-sm);
}

.error {
  color: var(--accent);
  font-size: var(--font-sm);
}
</style>
