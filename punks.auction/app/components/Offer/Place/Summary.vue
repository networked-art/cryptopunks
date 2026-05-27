<template>
  <section
    v-if="hasSummary"
    class="offer-summary"
  >
    <div
      v-if="hasCopy"
      class="summary-copy"
    >
      <span
        v-if="showSummaryTitle"
        class="summary-title"
      >
        {{ summaryTitle }}
      </span>
      <span
        v-if="summaryDetail"
        class="summary-detail"
      >
        {{ summaryDetail }}
      </span>
    </div>

    <ul
      v-if="showSlots"
      class="summary-slots"
    >
      <li
        v-for="slot in slotSummaries"
        :key="slot.label"
        class="summary-slot"
      >
        <div class="slot-heading">
          <span class="slot-label">{{ slot.label }}</span>
          <span class="slot-copy">
            <span class="slot-title">{{ slot.title }}</span>
            <span
              v-if="slot.detail"
              class="slot-detail"
            >
              {{ slot.detail }}
            </span>
          </span>
        </div>

        <LazyPunkGrid
          v-if="slotPreviewIds(slot).length"
          class="slot-preview"
          :ids="slotPreviewIds(slot)"
          :size="slotPreviewSize"
          scrollable
          :interactive="false"
        />
      </li>
    </ul>

    <PunkThumb
      v-if="singlePunkId !== null"
      class="single-preview"
      :punk-id="singlePunkId"
      :size="singlePreviewSize"
      :link="false"
    />

    <LazyPunkGrid
      v-else-if="!showSlots && summaryPreviewIds.length"
      class="summary-preview"
      :ids="summaryPreviewIds"
      :size="size"
      scrollable
      :interactive="false"
    />
  </section>
</template>

<script setup lang="ts">
import type {
  PlaceOfferDraft,
  PlaceOfferSlotSummary,
} from '~/composables/usePlaceOfferDraft'

const props = withDefaults(
  defineProps<{
    draft: PlaceOfferDraft
    size?: number
  }>(),
  { size: 72 },
)

const previewIds = computed(() => props.draft.previewIds)
const slotSummaries = computed(() => props.draft.slotSummaries)
const singlePunkId = computed(() => props.draft.singlePunkId ?? null)
const singleSlotSummary = computed(() =>
  slotSummaries.value.length === 1 ? slotSummaries.value[0] : null,
)
const singlePreviewSize = computed(() => props.size * 3)
const slotPreviewSize = computed(() =>
  Math.max(24, Math.round((props.size * 2) / 3 / 24) * 24),
)
const summaryTitle = computed(() => props.draft.summaryTitle)
const summaryDetail = computed(() => props.draft.summaryDetail)
const showSlots = computed(() => slotSummaries.value.length > 1)
const showSummaryTitle = computed(
  () => !!summaryTitle.value && summaryTitle.value !== props.draft.title,
)
const hasCopy = computed(
  () =>
    (showSummaryTitle.value && !!summaryTitle.value) || !!summaryDetail.value,
)
const hasSummary = computed(
  () => hasCopy.value || showSlots.value || summaryPreviewIds.value.length > 0,
)
const summaryPreviewIds = computed(() =>
  singleSlotSummary.value
    ? slotPreviewIds(singleSlotSummary.value)
    : previewIds.value,
)

function slotPreviewIds(slot: PlaceOfferSlotSummary) {
  return slot.previewIds
}
</script>

<style scoped>
.offer-summary {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  padding-block: var(--size-4);
  border-bottom: var(--border);
}

.summary-copy {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.summary-title,
.summary-detail {
  overflow-wrap: anywhere;
}

.summary-title {
  color: var(--text);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.summary-detail {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.summary-slots {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.summary-slot {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  min-width: 0;
  padding-block-start: var(--size-3);
  border-top: var(--border);
}

.summary-slot:first-child {
  padding-block-start: 0;
  border-top: 0;
}

.slot-heading {
  display: grid;
  grid-template-columns: calc(var(--form-item-height) * 2) minmax(0, 1fr);
  gap: var(--size-3);
  align-items: baseline;
  min-width: 0;
}

.slot-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  text-transform: uppercase;
}

.slot-copy {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  min-width: 0;
}

.slot-title,
.slot-detail {
  overflow-wrap: anywhere;
  font-size: var(--font-sm);
}

.slot-title {
  color: var(--text);
}

.slot-detail {
  color: var(--text-muted);
}

.slot-preview {
  max-block-size: calc(var(--form-item-height) * 4);
  min-height: 0;
}

.summary-preview {
  max-block-size: calc(var(--form-item-height) * 8);
  min-height: 0;
}

.single-preview {
  align-self: flex-start;
}
</style>
