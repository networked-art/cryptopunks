<template>
  <div class="bid-form">
    <p
      v-if="!marketAddress"
      class="warn"
    >
      PunksMarket contract is not configured yet.
    </p>

    <p
      v-else-if="compileError"
      class="warn"
    >
      {{ compileError }}
    </p>

    <p
      v-else-if="query"
      class="muted match-count"
    >
      Bid applies to <strong>{{ matchCount.toLocaleString() }}</strong>
      matching punk{{ matchCount === 1 ? '' : 's' }}.
    </p>

    <label>
      <span class="label">Bid amount</span>
      <input
        v-model="bidEth"
        type="number"
        step="0.01"
        min="0"
        placeholder="0.5"
      />
    </label>

    <div class="actions">
      <Button
        class="primary"
        :disabled="!canPlace"
        @click="actPlace"
      >
        {{ address ? 'Place bid' : 'Connect wallet' }}
      </Button>
    </div>

    <EvmTransactionFlowDialog
      ref="dialogRef"
      chain="mainnet"
      :text="dialogText"
      keep-open
      skip-confirmation
      @complete="onComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { parseEther, type Hash } from 'viem'
import { writeContract } from '@wagmi/core'
import { useAccount, useConfig } from '@wagmi/vue'
import {
  compileOfferSlot,
  emptyPunksFilter,
  type PunkQuery,
  type PunksFilter,
} from '@networked-art/punks-sdk'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { usePunksMarketAddress } from '~/utils/addresses'

const props = defineProps<{ query?: PunkQuery }>()
const emit = defineEmits<{ placed: [] }>()

const marketAddress = usePunksMarketAddress()
const config = useConfig()
const { address } = useAccount()
const offline = usePunksOffline()

const bidEth = ref('')

const bidWei = computed(() => parseEthSafe(bidEth.value))

function parseEthSafe(input: string): bigint | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const wei = parseEther(trimmed as `${number}`)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

/// Strip pagination/sort before handing the query to `compileOfferSlot` —
/// those fields are not part of the onchain filter and the SDK rejects them.
const compileInput = computed<PunkQuery | null>(() => {
  if (!props.query) return null
  const { sort: _s, offset: _o, limit: _l, ...rest } = props.query
  return rest
})

type CompiledOk = {
  criteria: PunksFilter
  includeIds: number[]
  excludeIds: number[]
}

const compiled = computed<{ ok: CompiledOk } | { error: string } | null>(() => {
  const input = compileInput.value
  if (!input) return null
  try {
    const slot = compileOfferSlot(offline.dataset.source, { query: input })
    if (slot.includeIds.length > 64) {
      return {
        error: `Search yields ${slot.includeIds.length} include ids — max 64 per bid.`,
      }
    }
    if (slot.excludeIds.length > 64) {
      return {
        error: `Search yields ${slot.excludeIds.length} exclude ids — max 64 per bid.`,
      }
    }
    return {
      ok: {
        criteria: slot.criteria,
        includeIds: slot.includeIds,
        excludeIds: slot.excludeIds,
      },
    }
  } catch (e) {
    return {
      error:
        (e as Error)?.message ??
        'Search cannot be expressed as an onchain bid filter.',
    }
  }
})

const compileError = computed(() =>
  compiled.value && 'error' in compiled.value ? compiled.value.error : null,
)

const matchCount = computed(() => {
  try {
    return offline.count(props.query ?? {})
  } catch {
    return 0
  }
})

const canPlace = computed(
  () =>
    !!address.value &&
    !!marketAddress.value &&
    bidWei.value !== null &&
    !compileError.value &&
    matchCount.value > 0,
)

type DialogRef = {
  initializeRequest: (request?: () => Promise<Hash>) => void
} | null
const dialogRef = ref<DialogRef>(null)
const dialogText = ref<{
  title?: Record<string, string>
  lead?: Record<string, string>
}>({})

async function actPlace() {
  if (!canPlace.value) return

  const slot =
    compiled.value && 'ok' in compiled.value
      ? compiled.value.ok
      : {
          criteria: emptyPunksFilter(),
          includeIds: [] as number[],
          excludeIds: [] as number[],
        }

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
        0n,
        slot.criteria,
        slot.includeIds,
        slot.excludeIds,
      ],
      value: bidWei.value!,
    })
  })
}

function onComplete() {
  bidEth.value = ''
  emit('placed')
}
</script>

<style scoped>
.bid-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
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

.match-count {
  font-size: 12px;
  margin: 0;
}
</style>
