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
          background="transparent"
          glitch="always"
          :speed="0.1"
          :strength="0.4"
        />
      </div>

      <div class="hero-info">
        <h1 class="hero-title">
          Punk <span class="dim">#</span>{{ id }}<span
            v-if="isWrapped"
            class="dim"
          >
            (Wrapped)</span
          >
        </h1>

        <p class="hero-meta">
          <NuxtLink
            class="tag"
            :to="searchHref(summary.punkTypeName)"
            >{{ summary.punkTypeName }}</NuxtLink
          >
          <NuxtLink
            class="tag"
            :to="searchHref(`${summary.attributeCount} attributes`)"
            >{{ summary.attributeCount }} attribute{{
              summary.attributeCount === 1 ? '' : 's'
            }}</NuxtLink
          >
          <NuxtLink
            class="tag"
            :to="searchHref(`${summary.colorCount} colors`)"
            >{{ summary.colorCount }} colors</NuxtLink
          >
          <NuxtLink
            class="tag"
            :to="searchHref(`${summary.pixelCount} pixels`)"
            >{{ summary.pixelCount }} px</NuxtLink
          >
        </p>

        <ul class="trait-list">
          <li
            v-for="t in traits"
            :key="t.id"
          >
            <span class="trait-kind">{{ t.kind }}</span>
            <NuxtLink
              class="trait-name"
              :to="traitHref(t.name)"
              >{{ t.name }}</NuxtLink
            >
            <span class="muted trait-supply">{{ t.supply }}</span>
          </li>
        </ul>

        <ClientOnly>
          <PunkV1Panel
            :punk-id="id"
            :matching-bids="matchingBids"
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
import {
  HeadVariant,
  headVariantNames,
  skinToneHeadVariants,
  skinToneNames,
  type HeadVariantName,
  type SkinToneName,
} from '@networked-art/punks-sdk'

const route = useRoute()
const id = computed(() => Number(route.params.id))

useHead(() => ({ title: `Punk #${id.value} · punksmarket.xyz` }))

const offline = usePunksOffline()
const summary = computed(() => offline.get(id.value, { includeTraits: true }))

/// HeadVariant trait rows are reframed as "Skin Tone" using our Dark →
/// Brown → Fair → Albino vocabulary. Alien / Ape / Zombie punks have no
/// skin tone — the NormalizedType row already shows the type, so we drop
/// the head-variant row entirely for them rather than showing nothing.
const skinToneByHeadVariant: Partial<Record<HeadVariantName, SkinToneName>> =
  (() => {
    const map: Partial<Record<HeadVariantName, SkinToneName>> = {}
    for (let tone = 0; tone < skinToneHeadVariants.length; tone++) {
      for (const hv of skinToneHeadVariants[tone]) {
        map[headVariantNames[hv]] = skinToneNames[tone]
      }
    }
    return map
  })()

const traits = computed(() =>
  (summary.value.traits ?? []).flatMap((t) => {
    if (t.kind !== 'HeadVariant') return [t]
    const tone = skinToneByHeadVariant[t.name as HeadVariantName]
    if (!tone) return []
    return [{ ...t, kind: 'Skin Tone', name: tone }]
  }),
)

const { isWrapped } = usePunkOwner(() => id.value)

const { events: history, refresh: refreshHistory } = useActivityFeed({
  punkId: () => id.value,
})

const {
  bids: matchingBids,
  pending: matchingPending,
  refresh: refreshBids,
} = useBidsMatchingPunk(() => id.value)

function refreshAll() {
  refreshHistory()
  refreshBids()
}

function searchHref(text: string) {
  return { path: '/', query: { q: text } }
}

function traitHref(name: string) {
  // Quote multi-word trait names so the text parser treats them as one
  // term instead of an AND of every word.
  return searchHref(/\s/.test(name) ? `"${name}"` : name)
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

.trait-name {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.trait-name:hover {
  border-bottom-color: currentColor;
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
