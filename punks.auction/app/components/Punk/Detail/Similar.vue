<template>
  <section class="block punk-similar">
    <h2 class="block-title eyebrow">Similar Punks</h2>
    <p
      v-if="!similarIds.length"
      class="block-note muted"
    >
      Finding similar Punks…
    </p>
    <div
      v-else
      class="similar-panel"
    >
      <LazyPunkGrid
        :ids="similarIds"
        :max-rows="SUGGESTION_ROWS"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  punkId: number
}>()

// Always fill exactly two full rows, whatever the width fits: request a pool
// comfortably larger than two rows can hold (the detail panel fits at most a
// handful of columns) and let PunkGrid's `maxRows` trim it to two full rows.
const SUGGESTION_ROWS = 2
const MAX_COLUMNS = 12
const SIMILAR_POOL = SUGGESTION_ROWS * MAX_COLUMNS

const similarityIndex = usePunkSimilarity()
const similarIds = shallowRef<number[]>([])

// The scorer ranks by appearance, so results always point at the canonical
// CryptoPunks collection — exactly what PunkGrid links to.
function refresh(punkId: number) {
  similarIds.value = similarityIndex()
    .similar(punkId, { limit: SIMILAR_POOL })
    .map((result) => result.punkId)
}

// Building the index scans all 10k Punks once. This strip sits at the bottom of
// the page, so defer that first build off the hydration path (behind the
// loading note) rather than block it inside a render-time computed. Later
// Punk-to-Punk navigation only re-scores the warm index, so it runs inline.
onMounted(() => {
  scheduleIdle(() => refresh(props.punkId))
  watch(() => props.punkId, refresh)
})

function scheduleIdle(callback: () => void) {
  type IdleWindow = Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number
  }
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(callback, { timeout: 1500 })
  } else {
    window.setTimeout(callback, 0)
  }
}
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

/* Bordered, elevated box matching the other detail sections (e.g. Market). */
.similar-panel {
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}
</style>
