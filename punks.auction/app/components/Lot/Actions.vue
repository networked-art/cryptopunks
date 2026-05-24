<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Action</h2>

      <label class="amount-field">
        <span class="label">Opening bid</span>
        <input
          v-model="bidEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          :placeholder="reserveEth"
        />
      </label>

      <p
        v-if="isPrivateLot && !canOpen"
        class="warn"
      >
        This lot is reserved for
        <NuxtLink :to="`/profile/${lot.onlySellTo}`">
          <Account :address="lot.onlySellTo" />
        </NuxtLink>
        .
      </p>

      <div
        v-if="!address"
        class="connect-row"
      >
        <EvmConnectDialog class-name="primary">Connect</EvmConnectDialog>
        <span class="muted">Connect a wallet to open the auction.</span>
      </div>

      <EvmTransactionFlowDialog
        v-else
        chain="mainnet"
        keep-open
        :request="openAuction"
        :text="dialogText"
        @complete="onComplete"
      >
        <template #start="{ start }">
          <Button
            class="primary"
            :disabled="!canOpen"
            @click="start"
          >
            Open auction <EthAmount :wei="bidButtonWei" />
          </Button>
        </template>

        <template #confirm>
          <p class="confirm-note muted">
            Reserve:
            <EthAmount :wei="lot.reserveWei" />
          </p>
        </template>

        <template #error>
          <p class="confirm-note muted">
            Reserve:
            <EthAmount :wei="lot.reserveWei" />
          </p>
        </template>
      </EvmTransactionFlowDialog>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ZERO_ADDRESS } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { formatEther, parseEther, type Address, type Hash } from 'viem'
import type { LotRecord } from '~/utils/auction'

const props = defineProps<{
  lot: LotRecord
}>()
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const reserveEth = computed(() => formatEther(props.lot.reserveWei))
const bidEth = ref('')
const parsedBidWei = computed(() => parseEthSafe(bidEth.value))
const bidButtonWei = computed(() => parsedBidWei.value ?? props.lot.reserveWei)

const isPrivateLot = computed(() => !sameAddress(props.lot.onlySellTo, ZERO_ADDRESS))
const canOpen = computed(() => {
  if (!address.value) return false
  return (
    !isPrivateLot.value || sameAddress(props.lot.onlySellTo, address.value)
  )
})

watch(
  () => props.lot.id,
  () => {
    bidEth.value = reserveEth.value
  },
  { immediate: true },
)

const dialogText = computed(() => ({
  title: { confirm: `Open lot #${props.lot.id}` },
  lead: {
    confirm: `Open this lot as a 24-hour auction with at least ${reserveEth.value} ETH.`,
  },
  action: { confirm: 'Open auction' },
}))

async function openAuction(): Promise<Hash> {
  if (!canOpen.value) throw new Error('This wallet cannot open the lot.')
  const amountWei = parsedBidWei.value
  if (!amountWei) throw new Error('Enter an opening bid greater than zero.')
  if (amountWei < props.lot.reserveWei) {
    throw new Error(`Enter at least ${reserveEth.value} ETH.`)
  }
  return execute(
    sdk.value.auctions.prepareOpenAuction({
      lotId: props.lot.id,
      reserveWei: props.lot.reserveWei,
      bidWei: amountWei,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  emit('changed', receipt.transactionHash)
}

function parseEthSafe(input: unknown): bigint | null {
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
.confirm-note,
.warn {
  margin: 0;
}

.confirm-note,
.connect-row,
.warn {
  font-size: var(--font-sm);
}

.amount-field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.amount-field input {
  width: 100%;
}

.connect-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  flex-wrap: wrap;
}

.warn {
  color: var(--accent-strong);
}

.warn a {
  border: 0;
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}
</style>
