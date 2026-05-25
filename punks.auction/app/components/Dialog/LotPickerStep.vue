<template>
  <div class="lot-picker-step">
    <p class="step-note muted">Choose the active lot to use with this offer.</p>

    <div class="lot-options">
      <button
        v-for="lot in lots"
        :key="String(lot.id)"
        type="button"
        class="unstyled lot-option"
        :class="{ selected: selectedLotId === lot.id }"
        @click="selectedLotId = lot.id"
      >
        <span>
          <strong>Lot #{{ lot.id }}</strong>
          <span class="muted">
            {{ formatLotItemsLabel(lot.items) }}
          </span>
        </span>
        <EthAmount :wei="lot.reserveWei" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatLotItemsLabel, type LotRecord } from '~/utils/auction'

defineProps<{
  lots: LotRecord[]
}>()

const selectedLotId = defineModel<bigint | null>({ required: true })
</script>

<style scoped>
.lot-picker-step {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.step-note {
  margin: 0;
  font-size: var(--font-sm);
}

.lot-options {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.lot-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.lot-option.selected {
  border-color: var(--primary);
  box-shadow: inset var(--border-width) 0 0 var(--primary);
}

.lot-option > span:first-child {
  display: grid;
  gap: var(--size-1);
  min-width: 0;
}

.lot-option strong,
.lot-option .muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lot-option strong {
  font-size: var(--font-sm);
}

.lot-option .muted {
  font-size: var(--font-xs);
}
</style>
