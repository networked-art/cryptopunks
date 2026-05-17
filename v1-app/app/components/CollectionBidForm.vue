<template>
  <div class="bid-form">
    <h3 class="form-title">Place a collection bid</h3>

    <p v-if="!marketAddress" class="warn">PunksMarket contract is not configured yet.</p>

    <div class="form-grid">
      <label>
        <span class="label">Bid amount</span>
        <input v-model="bidEth" type="number" step="0.01" min="0" placeholder="0.5" />
      </label>
      <label>
        <span class="label">Optional settlement bounty</span>
        <input v-model="settlementEth" type="number" step="0.001" min="0" placeholder="0" />
      </label>

      <label class="full">
        <span class="label">Include punk IDs (optional)</span>
        <input v-model="includeText" type="text" placeholder="e.g. 8348, 1234, 7777" />
        <span v-if="includeIds.length" class="hint muted">{{ includeIds.length }} ids</span>
      </label>
      <label class="full">
        <span class="label">Exclude punk IDs (optional)</span>
        <input v-model="excludeText" type="text" placeholder="e.g. 0, 1, 2" />
        <span v-if="excludeIds.length" class="hint muted">{{ excludeIds.length }} ids</span>
      </label>
    </div>

    <p class="muted total">
      Total locked: <strong><EthAmount :wei="totalWei" :precision="6" /></strong>
    </p>

    <div class="actions">
      <button
        class="primary"
        :disabled="!address || !marketAddress || bidWei === null"
        @click="actPlace"
      >
        {{ address ? 'Place bid' : 'Connect wallet' }}
      </button>
    </div>

    <EvmTransactionFlowDialog
      ref="dialogRef"
      chain="mainnet"
      :text="dialogText"
      keep-open
      skip-confirmation
      @complete="emit('placed')"
    />
  </div>
</template>

<script setup lang="ts">
import { parseEther, type Hash } from 'viem'
import { writeContract } from '@wagmi/core'
import { useAccount, useConfig } from '@wagmi/vue'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { usePunksMarketAddress } from '~/utils/addresses'

const emit = defineEmits<{ placed: [] }>()

const marketAddress = usePunksMarketAddress()
const config = useConfig()
const { address } = useAccount()

const bidEth = ref('')
const settlementEth = ref('')
const includeText = ref('')
const excludeText = ref('')

const bidWei = computed(() => parseEthSafe(bidEth.value))
const settlementWei = computed(() => parseEthSafe(settlementEth.value) ?? 0n)
const totalWei = computed(() => (bidWei.value ?? 0n) + settlementWei.value)

const includeIds = computed(() => parseIds(includeText.value))
const excludeIds = computed(() => parseIds(excludeText.value))

function parseIds(input: string): number[] {
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999)
}

function parseEthSafe(input: string): bigint | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed as `${number}`)
    return wei >= 0n ? wei : null
  } catch {
    return null
  }
}

// Empty Punks.Filter — matches everything. The user constrains with includeIds.
const EMPTY_FILTER = {
  requiredTraitMask: 0n,
  forbiddenTraitMask: 0n,
  anyOfTraitMask: 0n,
  requiredColorMask: 0n,
  forbiddenColorMask: 0n,
  anyOfColorMask: 0n,
  minPixelCount: 0,
  maxPixelCount: 0,
  minColorCount: 0,
  maxColorCount: 0,
}

type DialogRef = { initializeRequest: (request?: () => Promise<Hash>) => void } | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{ title?: Record<string, string>; lead?: Record<string, string> }>({})

async function actPlace() {
  if (!bidWei.value || !marketAddress.value) return

  dialogText.value = {
    title: { confirm: 'Place collection bid' },
    lead: { confirm: 'Place collection bid' },
  }

  dialogRef.value?.initializeRequest(async () => {
    return writeContract(config, {
      address: marketAddress.value!,
      abi: punksMarketAbi,
      functionName: 'placeBid',
      args: [
        bidWei.value!,
        settlementWei.value,
        EMPTY_FILTER,
        includeIds.value.map((n) => Number(n)),
        excludeIds.value.map((n) => Number(n)),
      ],
      value: totalWei.value,
    })
  })
}
</script>

<style scoped>
.bid-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.form-title {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.form-grid .full {
  grid-column: 1 / -1;
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.hint {
  font-size: 11px;
}

.total strong {
  color: var(--text);
  font-weight: 500;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.warn {
  color: #b8761c;
  font-size: 12px;
  margin: 0;
}
</style>
