<template>
  <OfferPlaceTargetShell>
    <OfferPlaceSearchToolbar
      v-model="searchText"
      placeholder="Any punk"
      disabled
    />

    <div class="collection-target">
      <LazyPunkGrid
        class="target-grid collection-grid"
        :ids="ids"
        :size="size"
        scrollable
        :interactive="false"
      />
      <div class="collection-overlay">
        Make an offer on any punk.
      </div>
    </div>
  </OfferPlaceTargetShell>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 72 },
)

const searchText = ref('')
const ids = Array.from({ length: 10000 }, (_, id) => id)
</script>

<style scoped>
.collection-target {
  position: relative;
  height: 100%;
  min-height: 0;
}

.collection-grid {
  height: 100%;
}

.collection-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--size-4);
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  color: var(--text);
  font-size: var(--font-sm);
  text-align: center;
  pointer-events: none;
}
</style>
