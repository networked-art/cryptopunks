<template>
  <ClientOnly>
    <section
      v-if="isSeller"
      class="actions-panel"
    >
      <h2 class="block-title eyebrow">Owner Actions</h2>

      <div class="action-block">
        <h3 class="action-title">Manage lot</h3>
        <p class="block-note muted">
          Update the reserve, restrict the initial buyer, or cancel the lot.
        </p>

        <div class="manage-fields">
          <label class="amount-field">
            <span class="label">Reserve ETH</span>
            <input
              v-model="reserveEth"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="amount-field">
            <span class="label">Initial buyer</span>
            <EvmAddressInput
              v-model="onlySellTo"
              placeholder="0x... or name.eth"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
        </div>

        <div class="button-row">
          <Button
            :disabled="!parsedReserveWei || !buyerInputSubmittable"
            @click="actUpdateLot"
          >
            Update lot
          </Button>
          <Button @click="actCancelLot">Cancel lot</Button>
        </div>
      </div>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :text="dialogText"
        keep-open
        skip-confirmation
        @complete="onComplete"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useConfig, useConnection } from '@wagmi/vue'
import {
  formatEther,
  isAddress,
  parseEther,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import { ZERO_ADDRESS, type LotRecord } from '~/utils/auction'
import { resolveAddressInput } from '~/utils/addressInput'

const props = defineProps<{ lot: LotRecord }>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const config = useConfig()
const { address } = useConnection()

const reserveEth = ref('')
const onlySellTo = ref('')

watch(
  () => props.lot,
  (lot) => {
    reserveEth.value = formatEther(lot.reserveWei)
    onlySellTo.value = sameAddress(lot.onlySellTo, ZERO_ADDRESS)
      ? ''
      : lot.onlySellTo
  },
  { immediate: true },
)

const isSeller = computed(() => sameAddress(address.value, props.lot.seller))
const parsedReserveWei = computed(() => parsePositiveEth(reserveEth.value))
const buyerInputSubmittable = computed(() => {
  const trimmed = onlySellTo.value.trim()
  return !trimmed || isAddress(trimmed) || trimmed.includes('.')
})

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
  action?: Record<string, string>
}>({})

async function resolveOnlySellTo(): Promise<Address> {
  const trimmed = onlySellTo.value.trim()
  if (!trimmed) return ZERO_ADDRESS
  return resolveAddressInput(config, trimmed, {
    invalidMessage: 'Enter a valid initial buyer address or ENS name.',
  })
}

function actUpdateLot() {
  const reserveWei = parsedReserveWei.value
  if (!reserveWei || !buyerInputSubmittable.value) return
  runRequest(
    async () => {
      const buyer = await resolveOnlySellTo()
      return execute(
        sdk.value.auctions.prepareUpdateLot({
          lotId: props.lot.id,
          reserveWei,
          onlySellTo: buyer,
        }),
      )
    },
    `Update lot #${props.lot.id}`,
    `Set this lot reserve to ${reserveEth.value.trim()} ETH.`,
    'Update',
  )
}

function actCancelLot() {
  runRequest(
    () => execute(sdk.value.auctions.prepareCancelLot(props.lot.id)),
    `Cancel lot #${props.lot.id}`,
    'Cancel this lot and release its Punk reservations.',
    'Cancel',
  )
}

function runRequest(
  request: () => Promise<Hash>,
  title: string,
  lead: string,
  action = 'Confirm',
) {
  dialogText.value = {
    title: { confirm: title, waiting: title },
    lead: { confirm: lead },
    action: { confirm: action },
  }
  dialogRef.value?.initializeRequest(request)
}

function onComplete(receipt: TransactionReceipt) {
  emit('changed', receipt.transactionHash as Hash)
}

function parsePositiveEth(input: unknown): bigint | null {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.actions-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.block-title,
.block-note {
  margin: 0;
}

.block-note {
  font-size: var(--font-sm);
}

.action-block {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.action-title {
  margin: 0;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input,
.amount-field :deep(.evm-address-input) {
  width: 100%;
}

.amount-field :deep(.evm-address-input) {
  min-width: 0;
}

.amount-field :deep(.evm-address-input > small) {
  font-size: 10px;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.manage-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  gap: var(--size-2);
}

.button-row {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

@media (max-width: 540px) {
  .manage-fields {
    grid-template-columns: 1fr;
  }
}
</style>
