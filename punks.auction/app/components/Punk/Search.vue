<template>
  <section class="punk-search">
    <PunkSearchBar
      v-model="text"
      :placeholder="placeholder"
      :counts="counts"
      @enter="onEnter"
      @clear="clearSearch"
    >
      <template #control>
        <FormCheckbox
          :model-value="listedActive"
          class="for-sale-toggle"
          aria-label="Sort by listed price"
          @update:model-value="toggleListed = !toggleListed"
        />
      </template>

      <template
        v-if="ownerHandle"
        #action
      >
        <Button
          class="search-bar-action"
          :to="`/profile/${ownerHandle}`"
        >
          View profile
        </Button>
      </template>
    </PunkSearchBar>

    <Card
      v-for="match in collectionMatches"
      :key="`${match.collection.slug}/${match.institution?.slug ?? ''}`"
      class="collection-card"
    >
      <span
        class="collection-arrow"
        aria-hidden="true"
        >↗</span
      >
      <span class="collection-title">{{
        match.institution?.title ?? match.collection.title
      }}</span>
      <span class="collection-subtitle">{{
        match.collection.description
      }}</span>
      <CardLink
        :to="match.institution?.source ?? match.collection.source"
        :title="match.institution?.title ?? match.collection.title"
        target="_blank"
        rel="noopener noreferrer"
      />
    </Card>

    <LazyPunkGrid
      :ids="ids"
      :size="size"
      :show-wrapped-state-colors="showWrappedStateColors"
    />
  </section>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'

const props = withDefaults(
  defineProps<{
    size?: number
    baseQuery?: PunkQuery
  }>(),
  { size: 56 },
)

const {
  text,
  toggleListed,
  listedActive,
  placeholder,
  ownerHandle,
  ids,
  counts,
  collectionMatches,
  showWrappedStateColors,
  onEnter,
  clearSearch,
} = usePunkSearch({
  baseQuery: () => props.baseQuery,
  syncRoute: true,
})
</script>

<style scoped>
.punk-search {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  width: 100%;
}

.for-sale-toggle.form-checkbox {
  /* Override the layer's checkbox tokens: square corners + listed-punk
     colourway, with the unchecked state shown at half opacity. */
  --border-radius: 0;
  --primary: var(--punk-bg-listed);

  gap: 0;
  margin-inline: var(--size-2);
}

.for-sale-toggle :deep(.form-checkbox-button) {
  inline-size: 16px;
  block-size: 16px;
  border: 0;
  background: var(--primary);
  opacity: 0.5;
  transition: opacity var(--speed);
}

.for-sale-toggle:hover :deep(.form-checkbox-button),
.for-sale-toggle:focus-within :deep(.form-checkbox-button) {
  opacity: 0.75;
}

.for-sale-toggle :deep(.form-checkbox-button[data-state='checked']),
.for-sale-toggle:hover :deep(.form-checkbox-button[data-state='checked']),
.for-sale-toggle:focus-within
  :deep(.form-checkbox-button[data-state='checked']) {
  opacity: 1;
}

.for-sale-toggle :deep(.form-checkbox-indicator .icon) {
  font-size: 12px;
}

/* Clickable explainer card, matching the detail-page collection cards:
   CardLink covers the whole card (and drives the built-in hover); the arrow
   floats top-right, aligned with the card's --spacer padding. */
.collection-card {
  gap: var(--size-1);
  font-size: var(--font-sm);
}

.collection-arrow {
  position: absolute;
  inline-size: auto;
  inset-block-start: var(--spacer);
  inset-inline-end: var(--spacer);
  color: var(--text-dim);
  transition: color var(--speed);
}

.collection-title {
  /* leave room for the floating arrow */
  padding-inline-end: var(--size-5);
}

.collection-subtitle {
  color: var(--text-dim);
  font-size: var(--font-xs);
  transition: color var(--speed);
}

/* On hover the muted arrow and description brighten to full-contrast text
   (white in dark mode) instead of staying greyed against the highlight. */
.collection-card:has(> .card-link:hover) .collection-arrow,
.collection-card:has(> .card-link:focus-visible) .collection-arrow,
.collection-card:has(> .card-link:hover) .collection-subtitle,
.collection-card:has(> .card-link:focus-visible) .collection-subtitle {
  color: var(--text);
}
</style>
