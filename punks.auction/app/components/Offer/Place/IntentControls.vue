<template>
  <section class="intent-controls">
    <div class="intent-options">
      <button
        type="button"
        class="unstyled intent-option"
        :class="{ selected: quantityMode === 'one' }"
        @click="selectQuantityMode('one')"
      >
        One Punk
      </button>

      <div
        class="slot-option"
        :class="{ selected: quantityMode === 'multiple' }"
      >
        <button
          type="button"
          class="unstyled intent-option slot-trigger"
          :class="{ selected: quantityMode === 'multiple' }"
          @click="selectQuantityMode('multiple')"
        >
          Multiple Punks
        </button>

        <Transition name="slot-count">
          <label
            v-if="quantityMode === 'multiple'"
            class="slot-count"
          >
            <input
              :value="slotCountText"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              aria-label="Number of Punks"
              autocomplete="off"
              :maxlength="String(maxSlots).length"
              @click.stop
              @focus="($event.target as HTMLInputElement).select()"
              @blur="commitSlotCount"
              @change="commitSlotCount"
              @keydown.enter.prevent="commitSlotCount"
              @input="
                updateSlotCountText(($event.target as HTMLInputElement).value)
              "
            />
          </label>
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PlaceOfferQuantityMode } from '~/composables/usePlaceOfferDraft'

const props = defineProps<{
  minSlots: number
  maxSlots: number
}>()

const quantityMode = defineModel<PlaceOfferQuantityMode>('quantityMode', {
  required: true,
})
const slotCount = defineModel<number>('slotCount', { required: true })
const emit = defineEmits<{
  restart: []
}>()
const slotCountText = ref(String(slotCount.value))

watch(slotCount, (value) => {
  slotCountText.value = String(value)
})

function selectQuantityMode(mode: PlaceOfferQuantityMode) {
  quantityMode.value = mode
  emit('restart')
}

function updateSlotCountText(value: string) {
  slotCountText.value = value.replace(/\D/g, '')
  const next = Number(slotCountText.value)
  if (
    Number.isFinite(next) &&
    next >= props.minSlots &&
    next <= props.maxSlots
  ) {
    updateSlotCount(Math.trunc(next))
  }
}

function commitSlotCount() {
  updateSlotCount(clampSlotCount(slotCountText.value))
  slotCountText.value = String(slotCount.value)
}

function updateSlotCount(next: number) {
  if (slotCount.value === next) return
  slotCount.value = next
  emit('restart')
}

function clampSlotCount(value: string | number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return props.minSlots
  return Math.min(props.maxSlots, Math.max(props.minSlots, Math.trunc(next)))
}
</script>

<style scoped>
.intent-controls {
  display: flex;
  margin-block-end: var(--size-4);
}

.intent-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2);
  min-width: 0;
}

.intent-option,
.slot-option {
  box-sizing: border-box;
  height: var(--form-item-height);
  border: 0;
  background: var(--tag-background);
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
  color: var(--muted);
  font-size: var(--font-sm);
  text-transform: uppercase;
  transition:
    color var(--speed),
    background-color var(--speed),
    box-shadow var(--speed);
}

.intent-option {
  padding-inline: var(--size-3);
  cursor: pointer;
}

.intent-option:hover,
.intent-option:focus-visible,
.intent-option.selected {
  background: var(--button-primary-background);
  box-shadow: 0 0 0 var(--border-width) var(--button-primary-border-color);
  color: var(--button-primary-color);
}

.intent-option:focus-visible {
  outline: none;
}

.slot-option {
  display: inline-flex;
  align-items: stretch;
  padding: 0;
}

.slot-option.selected {
  box-shadow: 0 0 0 var(--border-width) var(--button-primary-border-color);
}

.slot-option .intent-option {
  box-shadow: none;
}

.slot-trigger.selected {
  box-shadow: none;
}

.slot-count {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: calc(var(--form-item-height) * 1.75);
  max-inline-size: calc(var(--form-item-height) * 1.75);
  min-width: 0;
  height: var(--form-item-height);
  margin-inline-start: calc(-1 * var(--border-width));
  padding-inline: var(--size-3);
  background: var(--tag-background);
  box-shadow: calc(-1 * var(--border-width)) 0 0 0
    var(--button-primary-border-color);
  color: var(--text);
  overflow: hidden;
  text-transform: uppercase;
  transition:
    max-inline-size var(--speed),
    opacity var(--speed),
    padding-inline var(--speed),
    transform var(--speed);
}

.slot-count-enter-from,
.slot-count-leave-to {
  max-inline-size: 0;
  padding-inline: 0;
  opacity: 0;
  transform: translateX(calc(-1 * var(--size-1)));
}

.slot-count input {
  inline-size: 100%;
  min-width: calc(var(--form-item-height) * 0.75);
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text);
  font-size: var(--font-sm);
  text-align: center;
}

.slot-count input:focus,
.slot-count input:focus-visible {
  outline: none;
  box-shadow: none;
}
</style>
