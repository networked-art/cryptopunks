<template>
  <div
    class="slot-preview"
    aria-hidden="true"
  >
    <PunkMosaic
      v-if="row.previewItems.length"
      :items="row.previewItems"
    />
    <Icon
      v-else
      class="slot-icon"
      :name="row.icon"
    />
  </div>

  <span class="slot-copy">
    <span class="slot-title">
      {{ row.title }}
      <span
        v-if="row.titleStandard"
        class="slot-title-standard"
      >
        {{ row.titleStandard }}
      </span>
    </span>
    <span
      v-if="row.detailParts.length"
      class="slot-detail"
    >
      <template
        v-for="(part, index) in row.detailParts"
        :key="`${part.text}-${index}`"
      >
        <NuxtLink
          v-if="part.href"
          class="slot-detail-link"
          :to="part.href"
        >
          {{ part.text }}
        </NuxtLink>
        <span v-else>{{ part.text }}</span>
        <span
          v-if="index < row.detailParts.length - 1"
          class="slot-detail-separator"
        >
          ·
        </span>
      </template>
    </span>
  </span>
</template>

<script setup lang="ts">
import type { OfferSlotDisplay } from '~/composables/useOfferSlotDisplay'

defineProps<{
  row: OfferSlotDisplay
}>()
</script>

<style scoped>
.slot-preview {
  display: grid;
  place-items: center;
  inline-size: var(--size-8);
  block-size: var(--size-8);
  background: var(--gray-z-2);
  overflow: hidden;
}

.slot-icon {
  color: var(--text-muted);
  font-size: var(--font-lg);
}

.slot-copy {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.slot-title,
.slot-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-title {
  color: var(--text);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.slot-title-standard {
  color: var(--text-muted);
}

.slot-detail {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-transform: none;
}

.slot-detail-link {
  color: inherit;
  border: 0;
}

.slot-detail-link:hover,
.slot-detail-link:focus-visible {
  color: var(--accent);
}

.slot-detail-separator {
  color: var(--text-dim);
}
</style>
