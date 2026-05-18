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
          Punk <span class="dim">#</span>{{ id
          }}<span
            v-if="isWrapped"
            class="dim"
          >
            (Wrapped)</span
          >
        </h1>

        <Tags class="hero-meta">
          <NuxtLink :to="searchHref(summary.punkTypeName)">
            <Tag small>{{ summary.punkTypeName }}</Tag>
          </NuxtLink>
          <NuxtLink
            v-if="skinTag"
            :to="searchHref(skinTag.query)"
          >
            <Tag small>{{ skinTag.label }}</Tag>
          </NuxtLink>
          <NuxtLink :to="searchHref(`${summary.attributeCount} attributes`)">
            <Tag small
              >{{ summary.attributeCount }} attribute{{
                summary.attributeCount === 1 ? '' : 's'
              }}</Tag
            >
          </NuxtLink>
          <NuxtLink :to="searchHref(`${summary.colorCount} colors`)">
            <Tag small>{{ summary.colorCount }} colors</Tag>
          </NuxtLink>
          <NuxtLink :to="searchHref(`${summary.pixelCount} pixels`)">
            <Tag small>{{ summary.pixelCount }} px</Tag>
          </NuxtLink>
        </Tags>

        <ul class="trait-list">
          <li
            v-for="t in visibleTraits"
            :key="t.id"
          >
            <span class="trait-kind">{{ t.kind }}</span>
            <NuxtLink
              class="trait-name"
              :to="searchHref(t.query)"
              >{{ t.name }}</NuxtLink
            >
            <span class="muted trait-supply">{{ t.supply }}</span>
          </li>

          <li class="colors-row">
            <span class="trait-kind">Colors</span>
            <PunkColors :punk-id="id" />
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
  headVariantNames,
  skinToneHeadVariants,
  skinToneNames,
  type HeadVariantName,
  type SkinToneName,
} from '@networked-art/punks-sdk'

const route = useRoute()
const id = computed(() => Number(route.params.id))

useSeoMeta({
  title: () => `Punk #${id.value} · punksmarket.xyz`,
  ogTitle: () => `Punk #${id.value} · punksmarket.xyz`,
  twitterTitle: () => `Punk #${id.value} · punksmarket.xyz`,
})

const offline = usePunksOffline()
const summary = computed(() => offline.get(id.value, { includeTraits: true }))

type DisplayTrait = {
  id: number
  kind: string
  name: string
  supply: number
  query: string
}

/// HeadVariant trait rows are reframed as "Skin" using our Dark → Brown →
/// Fair → Albino vocabulary. Alien / Ape / Zombie punks have no skin tone
/// — the NormalizedType row already shows the type, so we drop the
/// head-variant row entirely for them rather than showing nothing.
const skinToneByHeadVariant: Partial<Record<HeadVariantName, SkinToneName>> =
  (() => {
    const map: Partial<Record<HeadVariantName, SkinToneName>> = {}
    skinToneHeadVariants.forEach((pair, tone) => {
      for (const hv of pair) {
        map[headVariantNames[hv]] = skinToneNames[tone]
      }
    })
    return map
  })()

const displayTraits = computed<DisplayTrait[]>(() =>
  (summary.value.traits ?? []).flatMap((t): DisplayTrait[] => {
    if (t.kind === 'HeadVariant') {
      const tone = skinToneByHeadVariant[t.name as HeadVariantName]
      if (!tone) return []
      return [
        {
          ...t,
          kind: 'Skin',
          name: tone,
          query: `${tone.toLowerCase()} skin`,
        },
      ]
    }
    if (t.kind === 'NormalizedType') {
      return [{ ...t, kind: 'Type', query: quoteIfMultiword(t.name) }]
    }
    if (t.kind === 'AttributeCount') {
      return [{ ...t, kind: 'Attributes', query: quoteIfMultiword(t.name) }]
    }
    return [{ ...t, query: quoteIfMultiword(t.name) }]
  }),
)

/// `Skin`, `Type`, and `Attributes` are surfaced in the hero-meta tags
/// already, so we hide their rows in the trait list to avoid the dupe.
/// What's left: accessories (one row each) and the inline `Colors` row.
const HIDDEN_KINDS = new Set(['Skin', 'Type', 'Attributes'])
const visibleTraits = computed(() =>
  displayTraits.value.filter((t) => !HIDDEN_KINDS.has(t.kind)),
)

/// Skin tag for the hero — `Dark Skin` / `Brown Skin` / `Fair Skin` /
/// `Albino Skin`, links to `<tone> skin` search. Non-humans (Alien, Ape,
/// Zombie) drop out because the underlying head-variant has no skin tone.
const skinTag = computed(() => {
  const tone = skinToneByHeadVariant[summary.value.headVariantName]
  if (!tone) return null
  return { label: `${tone} Skin`, query: `${tone.toLowerCase()} skin` }
})

function quoteIfMultiword(text: string) {
  // Quote multi-word trait names so the text parser treats them as one
  // term instead of an AND of every word.
  return /\s/.test(text) ? `"${text}"` : text
}

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
</script>

<style scoped>
.punk-page {
  padding: var(--size-6) var(--size-4) var(--size-8);
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.back {
  font-size: 12px;
  border: 0;
  align-self: flex-start;
}

.hero {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--size-6);
  align-items: start;
}

@media (max-width: 720px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero-image {
    justify-self: center;
  }
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
  container-type: inline-size;
}

.hero-title {
  font-size: 32px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0;
}

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--size-1) var(--size-9);
  font-size: 12px;
}

@container (max-width: 560px) {
  .trait-list {
    grid-template-columns: 1fr;
  }
}

.trait-list li {
  display: flex;
  align-items: baseline;
  gap: var(--size-2);
  padding: 4px 0;
  border-bottom: 1px dashed var(--border);
}

.trait-kind {
  text-transform: uppercase;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.06em;
  width: 76px;
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

/* Swatches don't have a text baseline, so center them against the
   label and supply column of a normal trait row. */
.colors-row {
  align-items: center;
}

.trait-supply {
  margin-left: auto;
  font-size: 10px;
}

.punk-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
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
  gap: var(--size-3);
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
