<template>
  <article
    class="review-slot"
    :class="[`is-${slot.displayKind}`, { 'is-single': single }]"
    :style="singlePunkStyle"
  >
    <header
      v-if="showHeader"
      class="review-slot-head"
    >
      <span class="slot-label">{{ slot.label }}</span>
      <span
        v-if="showSlotCopy"
        class="slot-copy"
      >
        <span
          v-if="showSlotTitle"
          class="slot-title"
        >
          {{ slotTitle }}
        </span>
        <span
          v-if="slot.detail"
          class="slot-detail"
        >
          {{ slot.detail }}
        </span>
      </span>
    </header>

    <p
      v-else-if="slot.detail && slot.displayKind === 'criteria'"
      class="single-detail"
    >
      {{ slot.detail }}
    </p>

    <div
      ref="previewEl"
      class="review-slot-preview"
    >
      <PunkThumb
        v-if="isSinglePunkPreview && firstPunkId !== null"
        class="single-punk"
        :punk-id="firstPunkId"
        :standard="slot.standard"
        :link="false"
        fluid
      />

      <OfferPlacePunkReviewGrid
        v-else-if="reviewItems.length"
        class="review-punk-grid"
        :class="{ large: single }"
        :items="reviewItems"
      />

      <LazyPunkGrid
        v-else-if="slot.displayKind === 'criteria' && slot.previewIds.length"
        class="criteria-preview"
        :ids="slot.previewIds"
        :size="previewSize"
        scrollable
        :interactive="false"
      />

      <template v-else />
    </div>
  </article>
</template>

<script setup lang="ts">
import type { PlaceOfferSlotSummary } from '~/composables/usePlaceOfferDraft'
import { formatOfferTraitTitle } from '~/utils/offerSlotText'

const props = withDefaults(
  defineProps<{
    slot: PlaceOfferSlotSummary
    size?: number
    showHeader?: boolean
    single?: boolean
  }>(),
  {
    size: 72,
    showHeader: false,
    single: false,
  },
)

const firstPunkId = computed(() => props.slot.previewIds[0] ?? null)
const previewEl = ref<HTMLElement | null>(null)
const singlePunkSize = ref<number | null>(null)
const previewSize = computed(() =>
  props.single
    ? props.size
    : Math.max(24, Math.round((props.size * 2) / 3 / 24) * 24),
)
const isSinglePunkSelection = computed(
  () =>
    props.slot.displayKind === 'selection' && props.slot.previewIds.length === 1,
)
const isSinglePunkPreview = computed(
  () =>
    props.single &&
    (props.slot.displayKind === 'exact' || isSinglePunkSelection.value),
)
const showSlotTitle = computed(
  () => props.slot.displayKind !== 'exact' && !isSinglePunkSelection.value,
)
const showSlotCopy = computed(
  () => showSlotTitle.value || Boolean(props.slot.detail),
)
const slotTitle = computed(() =>
  props.slot.displayKind === 'criteria'
    ? formatOfferTraitTitle(props.slot.title)
    : props.slot.title,
)
const singlePunkStyle = computed(() =>
  isSinglePunkPreview.value && singlePunkSize.value
    ? { '--single-punk-size': `${singlePunkSize.value}px` }
    : undefined,
)
const reviewItems = computed(() => {
  if (
    props.slot.displayKind !== 'selection' &&
    props.slot.displayKind !== 'exact'
  ) {
    return []
  }

  return props.slot.previewIds.map((punkId) => ({
    punkId,
    standard: props.slot.standard,
  }))
})

let resizeObserver: ResizeObserver | null = null

function updateSinglePunkSize() {
  if (!isSinglePunkPreview.value || !previewEl.value) {
    singlePunkSize.value = null
    return
  }

  const { width, height } = previewEl.value.getBoundingClientRect()
  singlePunkSize.value = Math.floor(Math.min(width, height))
}

onMounted(() => {
  updateSinglePunkSize()
  resizeObserver = new ResizeObserver(updateSinglePunkSize)
  if (previewEl.value) resizeObserver.observe(previewEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.review-slot {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  min-width: 0;
}

.review-slot.is-single {
  height: 100%;
  min-height: 0;
}

.review-slot-head {
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
.slot-detail,
.single-detail {
  overflow-wrap: anywhere;
  font-size: var(--font-sm);
}

.slot-title {
  color: var(--text);
}

.slot-detail,
.single-detail {
  color: var(--text-muted);
}

.single-detail {
  margin: 0;
}

.review-slot-preview {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.review-slot.is-single .review-slot-preview {
  align-items: center;
  justify-content: center;
}

.review-slot.is-single.is-criteria .review-slot-preview,
.review-slot.is-collection .review-slot-preview,
.review-slot.is-selection:not(.is-single) .review-slot-preview,
.review-slot.is-exact:not(.is-single) .review-slot-preview {
  align-items: flex-start;
  justify-content: flex-start;
}

.review-slot.is-single .single-punk {
  width: var(--single-punk-size, calc(var(--form-item-height) * 10));
  height: var(--single-punk-size, calc(var(--form-item-height) * 10));
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 1;
}

.review-punk-grid {
  flex: 1 1 auto;
  min-height: 0;
}

.review-punk-grid.large {
  --review-card-size: calc(var(--form-item-height) * 3.25);
}

.criteria-preview {
  flex: 1 1 auto;
  min-height: 0;
}

</style>
