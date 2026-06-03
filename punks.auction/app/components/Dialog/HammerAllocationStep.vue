<template>
  <div class="allocation-step">
    <p class="step-note muted">
      Set how the hammer price is split across the selected Punks.
    </p>

    <div class="allocation-list">
      <label
        v-for="(item, index) in items"
        :key="`${item.standard}-${item.punkId}-${item.slotIndex}`"
        class="allocation-row"
      >
        <span class="item-copy">
          <span class="item-title">
            Punk #{{ item.punkId }}
            <span
              v-if="item.standard === TokenStandard.CryptoPunksV1"
              class="item-standard"
            >
              (V1)
            </span>
          </span>
          <span class="muted">Slot {{ item.slotIndex + 1 }}</span>
        </span>
        <span class="field">
          <span class="label">Hammer %</span>
          <input
            :value="drafts[index] ?? ''"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            @input="onInput(index, $event)"
          />
        </span>
      </label>
    </div>

    <p
      class="total"
      :class="{ invalid: totalBps !== TOTAL_WEIGHT_BPS }"
    >
      Total {{ formatWeight(totalBps) }}%
    </p>
  </div>
</template>

<script setup lang="ts">
import { TOTAL_WEIGHT_BPS, TokenStandard } from '~/utils/auction'
import type { SelectedFulfillmentItem } from '~/utils/settle'

const props = defineProps<{
  items: SelectedFulfillmentItem[]
}>()

const weights = defineModel<number[]>({ required: true })
const drafts = ref<string[]>([])
const editing = ref(false)

const totalBps = computed(() =>
  weights.value.reduce((sum, weight) => sum + weight, 0),
)

watch(
  () => weights.value,
  (next) => {
    if (editing.value) return
    drafts.value = next.map(formatWeight)
  },
  { immediate: true },
)

watch(
  () => props.items.length,
  () => {
    if (weights.value.length !== props.items.length) {
      weights.value = equalWeights(props.items.length)
    }
  },
)

function onInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  editing.value = true
  const nextDrafts = [...drafts.value]
  nextDrafts[index] = input.value
  drafts.value = nextDrafts

  const nextWeights = nextDrafts.map((draft) => parseWeight(draft) ?? 0)
  weights.value = nextWeights
  void nextTick(() => {
    editing.value = false
  })
}

function parseWeight(input: string) {
  const trimmed = input.trim().replace(/%$/, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [whole = '0', fractional = ''] = trimmed.split('.')
  const weightBps = Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  return Number.isInteger(weightBps) && weightBps >= 0 && weightBps <= 10_000
    ? weightBps
    : null
}

function formatWeight(weightBps: number) {
  const percent = weightBps / 100
  return Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)
}

function equalWeights(count: number) {
  if (count <= 0) return []
  const base = Math.floor(TOTAL_WEIGHT_BPS / count)
  const weights = Array.from({ length: count }, () => base)
  weights[count - 1] =
    (weights[count - 1] ?? 0) + TOTAL_WEIGHT_BPS - base * count
  return weights
}
</script>

<style scoped>
.allocation-step {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.step-note,
.total {
  margin: 0;
  font-size: var(--font-sm);
}

.allocation-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.allocation-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: end;
  gap: var(--size-3);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
}

.item-copy,
.field {
  display: grid;
  gap: var(--size-1);
  min-width: 0;
}

.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.item-standard,
.item-copy .muted {
  font-size: var(--font-xs);
}

.field {
  justify-items: end;
}

.field input {
  width: 8ch;
  text-align: right;
}

.total {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.total.invalid {
  color: var(--accent-strong);
}

@media (max-width: 540px) {
  .allocation-row {
    grid-template-columns: 1fr;
  }

  .field {
    justify-items: stretch;
  }

  .field input {
    width: 100%;
  }
}
</style>
