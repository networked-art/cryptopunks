<template>
  <div class="container punk-page">
    <NuxtLink
      to="/"
      class="back muted"
      >← back to search</NuxtLink
    >

    <section class="hero">
      <div class="hero-image">
        <PunkImage
          :punk-id="id"
          :size="320"
          :background="background"
          glitch="always"
          :speed="0.01"
        />
      </div>

      <div class="hero-info">
        <h1 class="hero-title">Punk <span class="dim">#</span>{{ id }}</h1>

        <p class="hero-meta">
          <span class="tag">{{ summary.punkTypeName }}</span>
          <span class="tag"
            >{{ summary.attributeCount }} attribute{{
              summary.attributeCount === 1 ? '' : 's'
            }}</span
          >
          <span class="tag">{{ summary.colorCount }} colors</span>
          <span class="tag">{{ summary.pixelCount }} px</span>
        </p>

        <ul class="trait-list">
          <li
            v-for="t in traits"
            :key="t.id"
          >
            <span class="trait-kind">{{ t.kind }}</span>
            <span>{{ t.name }}</span>
            <span class="muted trait-supply">{{ t.supply }}</span>
          </li>
        </ul>

        <ClientOnly>
          <PunkV1Panel
            :punk-id="id"
            @changed="refreshAll"
          />
        </ClientOnly>
      </div>
    </section>

    <section class="punk-section">
      <h2 class="section-title">Matching collection bids</h2>
      <ClientOnly>
        <div
          v-if="matchingPending"
          class="muted"
        >
          Loading bids…
        </div>
        <div
          v-else-if="!matchingBids.length"
          class="muted"
        >
          No collection bids match this punk.
        </div>
        <div
          v-else
          class="bid-grid"
        >
          <BidCard
            v-for="b in matchingBids"
            :key="String(b.id)"
            :bid="b"
          />
        </div>
      </ClientOnly>
    </section>

    <section class="punk-section">
      <h2 class="section-title">History</h2>
      <ClientOnly>
        <ul
          v-if="history.length"
          class="event-list"
        >
          <ActivityRow
            v-for="(e, i) in history"
            :key="`${e.txHash}-${i}`"
            :event="e"
          />
        </ul>
        <div
          v-else
          class="muted"
        >
          No recent events for this punk.
        </div>
      </ClientOnly>
    </section>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const id = computed(() => Number(route.params.id))

useHead(() => ({ title: `Punk #${id.value} · punksmarket.xyz` }))

const offline = usePunksOffline()
const summary = computed(() => offline.get(id.value, { includeTraits: true }))
const traits = computed(() => summary.value.traits ?? [])

const background = computed(() => 'classic' as const)

const { events: history, refresh: refreshHistory } = useActivityFeed({
  punkId: () => id.value,
})

const {
  bids: allBids,
  pending: matchingPending,
  refresh: refreshBids,
} = usePunksMarketBids()
const matchingBids = computed(() =>
  allBids.value.filter((b) => {
    if (b.includeIds.length && !b.includeIds.includes(id.value)) return false
    if (b.excludeIds.length && b.excludeIds.includes(id.value)) return false
    return true
  }),
)

function refreshAll() {
  refreshHistory()
  refreshBids()
}
</script>

<style scoped>
.punk-page {
  padding: var(--space-6) var(--space-4) var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.back {
  font-size: 12px;
  border: 0;
  align-self: flex-start;
}

.hero {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-6);
  align-items: start;
}

@media (max-width: 720px) {
  .hero {
    grid-template-columns: 1fr;
  }
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.hero-title {
  font-size: 32px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0;
}

.hero-meta {
  margin: 0;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1) var(--space-3);
  font-size: 12px;
}

.trait-list li {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: 4px 0;
  border-bottom: 1px dashed var(--border);
}

.trait-kind {
  text-transform: uppercase;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.06em;
  width: 60px;
  flex-shrink: 0;
}

.trait-supply {
  margin-left: auto;
  font-size: 10px;
}

.punk-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.bid-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
}

.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}
</style>
