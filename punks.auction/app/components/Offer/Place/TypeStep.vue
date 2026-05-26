<template>
  <div class="type-step">
    <div class="type-grid">
      <button
        v-for="option in options"
        :key="option.kind"
        type="button"
        class="unstyled type-card"
        :class="{ selected: model === option.kind }"
        @click="choose(option.kind)"
      >
        <span class="type-title">{{ option.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  PLACE_OFFER_KIND_TITLES,
  type PlaceOfferKind,
} from '~/composables/usePlaceOfferDraft'

const model = defineModel<PlaceOfferKind | null>({ required: true })
const emit = defineEmits<{
  select: [kind: PlaceOfferKind]
}>()

const options: { kind: PlaceOfferKind; title: string }[] = [
  { kind: 'collection', title: PLACE_OFFER_KIND_TITLES.collection },
  { kind: 'single', title: PLACE_OFFER_KIND_TITLES.single },
  { kind: 'trait', title: PLACE_OFFER_KIND_TITLES.trait },
  { kind: 'multi', title: PLACE_OFFER_KIND_TITLES.multi },
]

function choose(kind: PlaceOfferKind) {
  model.value = kind
  emit('select', kind)
}
</script>

<style scoped>
.type-step {
  display: grid;
  place-items: center;
  min-height: 100%;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
  width: 100%;
  max-width: calc(var(--form-item-height) * 12);
}

.type-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(var(--form-item-height) * 3);
  padding: var(--size-3) var(--size-4);
  border: var(--border);
  background: var(--bg);
  color: inherit;
  text-align: center;
  cursor: pointer;
}

.type-card:hover,
.type-card:focus-visible,
.type-card.selected {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--bg-elevated);
}

.type-card:focus-visible {
  outline: var(--border-width) solid var(--primary);
  outline-offset: calc(-1 * var(--border-width));
}

.type-title {
  color: inherit;
  font-size: var(--font-lg);
  font-weight: var(--font-weight-normal);
}

@media (max-width: 640px) {
  .type-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
