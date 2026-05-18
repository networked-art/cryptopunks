<template>
  <EvmTransactionFlowDialog
    chain="mainnet"
    keep-open
    :request="placeBid"
    :text="dialogText"
    @complete="onComplete"
  >
    <template #start="{ start }">
      <Button
        :disabled="!canStart"
        @click="start"
      >
        {{ address ? 'Bid' : 'Connect wallet' }}
      </Button>
    </template>

    <template #confirm>
      <p
        v-if="compileError"
        class="warn"
      >
        {{ compileError }}
      </p>
      <p
        v-else-if="query"
        class="muted match-count"
      >
        Bid applies to
        <strong>{{ matchCount.toLocaleString() }}</strong> matching punk{{
          matchCount === 1 ? '' : 's'
        }}.
      </p>

      <label class="bid-amount">
        <span class="label">Bid amount</span>
        <input
          v-model="bidEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="0.5"
        />
      </label>
    </template>

    <template #error>
      <label class="bid-amount">
        <span class="label">Bid amount</span>
        <input
          v-model="bidEth"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          placeholder="0.5"
        />
      </label>
    </template>
  </EvmTransactionFlowDialog>
</template>

<script setup lang="ts">
import { parseEther, type Hash } from 'viem'
import { writeContract } from '@wagmi/core'
import { useConnection, useConfig } from '@wagmi/vue'
import {
  compileOfferSlot,
  type PunkQuery,
  type PunksFilter,
} from '@networked-art/punks-sdk'
import { punksMarketAbi } from '~/utils/punksMarketAbi'
import { usePunksMarketAddress } from '~/utils/addresses'

const props = defineProps<{ query?: PunkQuery }>()
const emit = defineEmits<{ placed: [] }>()

const marketAddress = usePunksMarketAddress()
const config = useConfig()
const { address } = useConnection()
const offline = usePunksOffline()

const bidEth = ref('')

const bidWei = computed(() => parseEthSafe(bidEth.value))

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

const canStart = computed(
  () =>
    !!address.value &&
    !!marketAddress.value &&
    !compileError.value &&
    matchCount.value > 0,
)

const dialogText = {
  title: { confirm: 'Place collection bid' },
  lead: {
    confirm: 'Enter the amount of ETH you want to bid for the matching punks.',
  },
  action: { confirm: 'Place bid' },
}

async function placeBid(): Promise<Hash> {
  const slot =
    compiled.value && 'ok' in compiled.value ? compiled.value.ok : null
  if (!slot) {
    throw new Error(
      compileError.value ??
        'Search cannot be expressed as an onchain bid filter.',
    )
  }
  if (bidWei.value === null) {
    throw new Error('Enter a bid amount greater than zero.')
  }
  if (!marketAddress.value) {
    throw new Error('PunksMarket contract is not configured yet.')
  }

  return writeContract(config, {
    address: marketAddress.value,
    abi: punksMarketAbi,
    functionName: 'placeBid',
    args: [bidWei.value, 0n, slot.criteria, slot.includeIds, slot.excludeIds],
    value: bidWei.value,
  })
}

function onComplete() {
  bidEth.value = ''
  emit('placed')
}
</script>

<style scoped></style>
