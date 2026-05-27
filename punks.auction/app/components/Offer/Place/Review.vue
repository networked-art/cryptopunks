<template>
  <section
    v-if="slots.length"
    class="offer-review"
    :class="{
      'is-multiple': isMultiple,
      'is-single-punk': isSinglePunk,
    }"
  >
    <div class="review-scroll">
      <ul
        v-if="isMultiple"
        class="review-slots"
      >
        <li
          v-for="slot in slots"
          :key="slot.label"
          class="review-slot-item"
        >
          <OfferPlaceReviewSlot
            :slot="slot"
            :size="size"
            show-header
          />
        </li>
      </ul>

      <OfferPlaceReviewSlot
        v-else
        :slot="slots[0]!"
        :size="size"
        single
      />
    </div>

    <footer class="review-summary">
      <span class="summary-label">Summary</span>
      <span class="summary-copy">{{ summaryCopy }}</span>
      <ul
        v-if="summaryItems.length"
        class="summary-items"
      >
        <li
          v-for="item in summaryItems"
          :key="item.label"
          class="summary-item"
        >
          <span class="summary-item-label">{{ item.label }}</span>
          <span>{{ item.copy }}</span>
        </li>
      </ul>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { PlaceOfferDraft } from '~/composables/usePlaceOfferDraft'

const props = withDefaults(
  defineProps<{
    draft: PlaceOfferDraft
    size?: number
  }>(),
  { size: 72 },
)

const slots = computed(() => props.draft.slotSummaries)
const isMultiple = computed(() => slots.value.length > 1)
const isSinglePunk = computed(() => {
  if (slots.value.length !== 1) return false

  const [slot] = slots.value
  return (
    slot?.displayKind === 'exact' ||
    (slot?.displayKind === 'selection' && slot.previewIds.length === 1)
  )
})
const summaryCopy = computed(() => {
  if (slots.value.length > 1) {
    return `If filled, you receive ${slots.value.length.toLocaleString()} Punks total.`
  }

  const [slot] = slots.value
  if (!slot) return ''

  return `This offer can be fulfilled with ${slotFulfillmentText(slot)}.`
})
const summaryItems = computed(() => {
  if (slots.value.length <= 1) return []

  return slots.value.map((slot) => ({
    label: slot.label,
    copy: `Can be fulfilled with ${slotFulfillmentText(slot)}.`,
  }))
})

function slotFulfillmentText(slot: PlaceOfferDraft['slotSummaries'][number]) {
  if (slot.displayKind === 'exact') return slot.title
  if (slot.displayKind === 'selection') {
    if (slot.previewIds.length === 1) return `Punk #${slot.previewIds[0]}`

    return `one of the ${formatPunkCount(slot.previewIds.length)} in this selection`
  }
  if (slot.displayKind === 'criteria') {
    return `one Punk matching ${formatCriteriaTitle(slot.title)} (${formatEligibleCount(slot.previewIds.length)})`
  }
  return 'any Punk'
}

function formatPunkCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? 'Punk' : 'Punks'}`
}

function formatEligibleCount(count: number) {
  return `${count.toLocaleString()} eligible`
}

function formatCriteriaTitle(title: string) {
  const text = title.trim()
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text
}
</script>

<style scoped>
.offer-review {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.review-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.offer-review.is-single-punk .review-scroll {
  overflow: hidden;
}

.review-summary {
  display: grid;
  gap: var(--size-1);
  flex: 0 0 auto;
  margin-block-start: var(--size-3);
  padding-block-start: var(--size-3);
  border-top: var(--border);
}

.summary-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  text-transform: uppercase;
}

.summary-copy {
  color: var(--text);
  font-size: var(--font-sm);
}

.summary-items {
  display: grid;
  gap: var(--size-1);
  margin: var(--size-1) 0 0;
  padding: 0;
  list-style: none;
}

.summary-item {
  display: grid;
  grid-template-columns: calc(var(--form-item-height) * 2) minmax(0, 1fr);
  gap: var(--size-3);
  color: var(--text);
  font-size: var(--font-sm);
}

.summary-item-label {
  color: var(--text-muted);
  text-transform: uppercase;
}

.review-slots {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-slot-item {
  min-width: 0;
  padding-block-start: var(--size-4);
  border-top: var(--border);
}

.review-slot-item:first-child {
  padding-block-start: 0;
  border-top: 0;
}
</style>
