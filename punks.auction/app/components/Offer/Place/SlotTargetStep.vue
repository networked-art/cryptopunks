<template>
  <div class="slot-target-step">
    <div class="slot-target-options">
      <button
        v-for="option in targetOptions"
        :key="option.value"
        type="button"
        class="unstyled target-option"
        :class="{ selected: targetMode === option.value }"
        @click="targetMode = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <OfferPlaceSingleTarget
      v-if="targetMode === 'exact'"
      v-model:text="exactSearchText"
      v-model:selected-id="exactPunkId"
      :size="size"
    />

    <OfferPlaceTraitTarget
      v-else-if="targetMode === 'traits'"
      v-model:text="traitSearchText"
      v-model:selected-text="traitText"
      v-model:selected-query="traitQuery"
      v-model:selected-match-ids="traitMatchIds"
      v-model:include-ids="traitIncludeIds"
      v-model:exclude-ids="traitExcludeIds"
      :size="size"
    />

    <OfferPlaceCollectionTarget
      v-else
      :size="size"
    />
  </div>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'
import {
  createPlaceOfferSlotDraft,
  type PlaceOfferSlotDraft,
  type PlaceOfferTargetMode,
} from '~/composables/usePlaceOfferDraft'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const model = defineModel<PlaceOfferSlotDraft>({ required: true })
const current = ref<PlaceOfferSlotDraft>(createPlaceOfferSlotDraft())

const targetOptions: {
  value: PlaceOfferTargetMode
  label: string
}[] = [
  { value: 'exact', label: 'Specific Punk' },
  { value: 'traits', label: 'Trait offer' },
  { value: 'any', label: 'Collection offer' },
]

const targetMode = computed({
  get: () => current.value.targetMode,
  set: (value: PlaceOfferTargetMode) => updateCurrent({ targetMode: value }),
})
const exactSearchText = computed({
  get: () => current.value.exactSearchText,
  set: (value: string) => updateCurrent({ exactSearchText: value }),
})
const exactPunkId = computed({
  get: () => current.value.exactPunkId,
  set: (value: number | null) => updateCurrent({ exactPunkId: value }),
})
const traitSearchText = computed({
  get: () => current.value.traitSearchText,
  set: (value: string) => updateCurrent({ traitSearchText: value }),
})
const traitText = computed({
  get: () => current.value.traitText,
  set: (value: string) => updateCurrent({ traitText: value }),
})
const traitQuery = computed({
  get: () => current.value.traitQuery,
  set: (value: PunkQuery | null) => updateCurrent({ traitQuery: value }),
})
const traitMatchIds = computed({
  get: () => current.value.traitMatchIds,
  set: (value: number[]) => updateCurrent({ traitMatchIds: value }),
})
const traitIncludeIds = computed({
  get: () => current.value.traitIncludeIds,
  set: (value: number[]) => updateCurrent({ traitIncludeIds: value }),
})
const traitExcludeIds = computed({
  get: () => current.value.traitExcludeIds,
  set: (value: number[]) => updateCurrent({ traitExcludeIds: value }),
})

watch(
  model,
  (next) => {
    current.value = normalizeSlot(next)
  },
  { immediate: true },
)

function updateCurrent(patch: Partial<PlaceOfferSlotDraft>) {
  current.value = {
    ...current.value,
    ...patch,
  }
  model.value = current.value
}

function normalizeSlot(slot: PlaceOfferSlotDraft | undefined) {
  return {
    ...createPlaceOfferSlotDraft(),
    ...slot,
  }
}
</script>

<style scoped>
.slot-target-step {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--size-3);
  height: 100%;
  min-height: 0;
}

.slot-target-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  min-width: 0;
}

.target-option {
  box-sizing: border-box;
  height: var(--form-item-height);
  padding-inline: var(--size-3);
  border: 0;
  background: var(--tag-background);
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
  color: var(--muted);
  cursor: pointer;
  font-size: var(--font-sm);
  text-transform: uppercase;
  transition:
    color var(--speed),
    background-color var(--speed),
    box-shadow var(--speed);
}

.target-option:hover,
.target-option:focus-visible,
.target-option.selected {
  background: var(--button-primary-background);
  box-shadow: 0 0 0 var(--border-width) var(--button-primary-border-color);
  color: var(--button-primary-color);
}

.target-option:focus-visible {
  outline: none;
}
</style>
