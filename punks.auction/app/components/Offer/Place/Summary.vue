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
        v-if="summaryTitle"
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

    <PunkThumb
      v-if="singlePunkId !== null"
      class="single-preview"
      :punk-id="singlePunkId"
      :size="size"
      :link="false"
    />

    <LazyPunkGrid
      v-else-if="previewIds.length"
      class="summary-preview"
      :ids="previewIds"
      :size="size"
      scrollable
      :interactive="false"
    />
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

const previewIds = computed(() => props.draft.previewIds)
const singlePunkId = computed(() =>
  props.draft.kind === 'single' ? (previewIds.value[0] ?? null) : null,
)
const summaryTitle = computed(() => props.draft.summaryTitle)
const summaryDetail = computed(() => props.draft.summaryDetail)
const hasCopy = computed(() => !!summaryTitle.value || !!summaryDetail.value)
const hasSummary = computed(() => hasCopy.value || previewIds.value.length > 0)
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

.summary-preview {
  block-size: calc(var(--form-item-height) * 8);
}

.single-preview {
  margin-inline: auto;
}
</style>
