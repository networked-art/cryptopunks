<template>
  <div class="selection-step">
    <p class="step-note muted">
      Choose the Punks that will fill this offer. Each row maps directly to the
      matching offer slot.
    </p>

    <div class="slot-list">
      <section
        v-for="selectionSlot in slots"
        :key="selectionSlot.index"
        class="slot-section"
      >
        <div class="slot-head">
          <span
            v-if="slots.length > 1"
            class="eyebrow"
          >
            Slot {{ selectionSlot.index + 1 }}
          </span>
          <strong>{{ selectionSlot.title }}</strong>
          <span
            v-if="selectionSlot.detail"
            class="muted"
          >
            {{ selectionSlot.detail }}
          </span>
        </div>

        <p
          v-if="!selectionSlot.candidates.length"
          class="empty muted"
        >
          No owned Punks match this slot.
        </p>

        <div
          v-else
          class="candidate-grid"
        >
          <button
            v-for="candidate in selectionSlot.candidates"
            :key="candidate.key"
            type="button"
            class="unstyled candidate"
            :class="{ selected: isSelected(selectionSlot.index, candidate) }"
            :disabled="isDisabled(selectionSlot.index, candidate)"
            @click="selectCandidate(selectionSlot.index, candidate)"
          >
            <PunkThumb
              :punk-id="candidate.punkId"
              :standard="candidate.standard"
              :size="44"
              :link="false"
            />
            <span class="candidate-copy">
              <span class="candidate-title">
                Punk #{{ candidate.punkId }}
                <span
                  v-if="candidate.standard === TokenStandard.CryptoPunksV1"
                  class="candidate-standard"
                >
                  (V1)
                </span>
              </span>
              <span class="candidate-detail muted">
                {{
                  candidate.unavailableReason ?? custodyLabel(candidate.custody)
                }}
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TokenStandard } from '~/utils/auction'
import type {
  OfferFulfillmentCandidate,
  OfferFulfillmentSlot,
} from '~/utils/offerFulfillment'

const props = defineProps<{
  slots: OfferFulfillmentSlot[]
}>()

const selectedKeys = defineModel<string[]>({ required: true })

function selectCandidate(
  slotIndex: number,
  candidate: OfferFulfillmentCandidate,
) {
  if (isDisabled(slotIndex, candidate)) return
  const next = [...selectedKeys.value]
  next[slotIndex] = candidate.key
  selectedKeys.value = next
}

function isSelected(slotIndex: number, candidate: OfferFulfillmentCandidate) {
  return selectedKeys.value[slotIndex] === candidate.key
}

function isDisabled(slotIndex: number, candidate: OfferFulfillmentCandidate) {
  return (
    !!candidate.unavailableReason ||
    selectedKeys.value.some(
      (key, index) => index !== slotIndex && key === candidate.key,
    )
  )
}

function custodyLabel(custody: OfferFulfillmentCandidate['custody']) {
  switch (custody) {
    case 'vault':
      return 'Ready in vault'
    case 'wallet':
      return 'In wallet'
    case 'stash':
      return 'In Stash'
    case 'wrapped-wallet':
      return 'Wrapped'
    case 'wrapped-stash':
      return 'Wrapped in Stash'
    default:
      return 'Unsupported custody'
  }
}
</script>

<style scoped>
.selection-step {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.step-note,
.empty {
  margin: 0;
  font-size: var(--font-sm);
}

.slot-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.slot-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.slot-head {
  display: grid;
  gap: var(--size-1);
  min-width: 0;
  font-size: var(--font-sm);
}

.candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--size-2);
}

.candidate {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  min-width: 0;
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.candidate:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.candidate.selected {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 3px var(--primary);
}

.candidate :deep(.punk-thumb) {
  border-radius: 0;
}

.candidate-copy {
  display: grid;
  gap: var(--size-1);
  min-width: 0;
}

.candidate-title,
.candidate-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-title {
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.candidate-standard,
.candidate-detail {
  font-size: var(--font-xs);
}
</style>
