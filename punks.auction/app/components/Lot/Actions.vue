<template>
  <ClientOnly>
    <section class="actions-panel">
      <h2 class="block-title eyebrow">Actions</h2>

      <p
        v-if="preview"
        class="block-note muted"
      >
        Wallet actions appear for live lot records.
      </p>

      <div class="action-block">
        <h3 class="action-title">Open as auction</h3>
        <p class="block-note muted">
          Start a 24-hour auction with an opening bid of
          <EthAmount :wei="lot.reserveWei" />.
        </p>

        <p
          v-if="!preview && isPrivateLot && !canOpen"
          class="warn"
        >
          This lot is reserved for
          <NuxtLink :to="`/profile/${lot.onlySellTo}`">
            <Account :address="lot.onlySellTo" />
          </NuxtLink>
          .
        </p>

        <Button
          v-if="preview"
          class="primary"
          disabled
        >
          Open auction <EthAmount :wei="lot.reserveWei" />
        </Button>

        <div
          v-else-if="!address"
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
              Open auction <EthAmount :wei="lot.reserveWei" />
            </Button>
          </template>
        </EvmTransactionFlowDialog>
      </div>

      <div
        class="action-divider"
        aria-hidden="true"
      />

      <div class="action-block">
        <h3 class="action-title">Accept an offer</h3>
        <p class="block-note muted">
          Pick a matching standing offer to settle this lot instantly.
        </p>
        <Button disabled>Accept offer</Button>
        <p class="hint muted">Wallet flow coming soon.</p>
      </div>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ZERO_ADDRESS } from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import { formatEther, type Address, type Hash } from 'viem'
import type { LotRecord } from '~/utils/auction'

const props = withDefaults(
  defineProps<{
    lot: LotRecord
    preview?: boolean
  }>(),
  {
    preview: false,
  },
)
const emit = defineEmits<{ changed: [tx: Hash] }>()

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()
const { address } = useConnection()

const isPrivateLot = computed(() => !sameAddress(props.lot.onlySellTo, ZERO_ADDRESS))
const canOpen = computed(() => {
  if (!address.value) return false
  return (
    !isPrivateLot.value || sameAddress(props.lot.onlySellTo, address.value)
  )
})

const dialogText = computed(() => ({
  title: { confirm: `Open lot #${props.lot.id}` },
  lead: {
    confirm: `Open this lot as a 24-hour auction with an opening bid of ${formatEther(props.lot.reserveWei)} ETH.`,
  },
  action: { confirm: 'Open auction' },
}))

async function openAuction(): Promise<Hash> {
  if (!canOpen.value) throw new Error('This wallet cannot open the lot.')
  return execute(
    sdk.value.auctions.prepareOpenAuction({
      lotId: props.lot.id,
      reserveWei: props.lot.reserveWei,
      bidWei: props.lot.reserveWei,
    }),
  )
}

function onComplete(receipt: { transactionHash: Hash }) {
  emit('changed', receipt.transactionHash)
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
.block-note,
.hint,
.warn {
  margin: 0;
}

.block-note,
.connect-row,
.hint,
.warn {
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

.action-divider {
  height: 1px;
  background: var(--border-color, currentColor);
  opacity: 0.15;
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

.hint {
  font-size: var(--font-xs);
}

.actions-panel :deep(button .eth-amount) {
  margin-left: var(--size-1);
}

.actions-panel :deep(button .eth-amount .unit) {
  color: inherit;
}
</style>
