<template>
  <section class="punk-search">
    <PunkSearchBar
      v-model="text"
      :placeholder="placeholder"
      :counts="counts"
      :suggestions="suggestions"
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

    <PunkCollectionCard
      v-for="match in collectionMatches"
      :key="`${match.collection.slug}/${match.institution?.slug ?? ''}`"
      :title="match.institution?.title ?? match.collection.title"
      :subtitle="match.collection.description"
      :href="match.institution?.source ?? match.collection.source"
    />

    <LazyPunkGrid
      :ids="ids"
      :prices="prices"
      :estimates="listedActive ? estimates : undefined"
      :size="size"
      :show-wrapped-state-colors="showWrappedStateColors"
      @visible="onVisible"
    />
  </section>
</template>

<script setup lang="ts">
import type { PunkQuery } from '@networked-art/punks-sdk'
import { TokenStandard } from '~/utils/auction'

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
  prices,
  counts,
  collectionMatches,
  showWrappedStateColors,
  suggestions,
  onEnter,
  clearSearch,
} = usePunkSearch({
  baseQuery: () => props.baseQuery,
  syncRoute: true,
})

// "For sale" mode shows real listings as prices; the rest get a model value
// estimate. The grid reports its visible window, we fetch estimates for the
// unlisted ids in it, and feed the (v2) cache back as a plain id→wei map.
const { estimates: estimateCache, request: requestEstimates } =
  usePunkValueEstimates()

const estimates = computed(() => {
  const map = new Map<number, bigint>()
  for (const [key, wei] of estimateCache.value) {
    if (key.startsWith('v2-')) map.set(Number(key.slice(3)), wei)
  }
  return map
})

function onVisible(visibleIds: number[]) {
  if (!listedActive.value) return
  requestEstimates(
    visibleIds
      .filter((id) => !prices.value?.has(id))
      .map((id) => ({ standard: TokenStandard.CryptoPunks, punkId: id })),
  )
}
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
</style>
