<template>
  <section class="block punk-similar">
    <h2 class="block-title eyebrow">Similar Punks</h2>
    <ClientOnly>
      <LazyPunkGrid
        v-if="similarIds.length"
        :ids="similarIds"
      />
      <template #fallback>
        <p class="block-note muted">Finding similar Punks…</p>
      </template>
    </ClientOnly>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  punkId: number
}>()

const SIMILAR_LIMIT = 12
const similarityIndex = usePunkSimilarity()

// The scorer ranks by appearance, so results always point at the canonical
// CryptoPunks collection — exactly what PunkGrid links to. Built lazily on the
// client (empty during SSR so the index build never runs on the server);
// recomputes when navigating between Punks.
const similarIds = computed<number[]>(() =>
  import.meta.client
    ? similarityIndex()
        .similar(props.punkId, { limit: SIMILAR_LIMIT })
        .map((result) => result.punkId)
    : [],
)
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}
</style>
