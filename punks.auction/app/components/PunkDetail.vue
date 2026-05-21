<template>
  <div class="punk-detail">
    <NuxtLink
      :to="backToSearchHref"
      class="back muted"
      >← back to search</NuxtLink
    >

    <section class="hero">
      <div class="hero-image">
        <PunkImage
          :punk-id="punkId"
          :size="320"
        />
        <ClientOnly>
          <Button
            class="download-btn small"
            :disabled="downloading"
            title="Download PNG"
            aria-label="Download PNG"
            @click="downloadImage"
          >
            <Icon :name="downloading ? 'lucide:loader' : 'lucide:download'" />
          </Button>
        </ClientOnly>
      </div>

      <div class="hero-info">
        <h1 class="hero-title">
          Punk <span class="dim">#</span>{{ punkId }}
          <Tag
            v-if="isV1"
            small
            class="v1-tag"
            >V1</Tag
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
            <PunkColors :punk-id="punkId" />
          </li>
        </ul>

        <ClientOnly>
          <div class="owner-panel">
            <span class="trait-kind">Owner</span>
            <NuxtLink
              v-if="ownerKnown"
              :to="`/profile/${owner}`"
            >
              <AccountBadge :address="owner!" />
            </NuxtLink>
            <span
              v-else-if="ownerPending"
              class="muted"
              >Loading…</span
            >
            <span
              v-else
              class="muted"
              >Unclaimed</span
            >
          </div>
        </ClientOnly>
      </div>
    </section>

    <ClientOnly>
      <section class="detail-section">
        <h2 class="section-title">On the auction house</h2>
        <div
          v-if="!deployed"
          class="muted"
        >
          <code>PunksAuction</code> is not deployed yet.
        </div>
        <div
          v-else-if="contextPending && isContextEmpty"
          class="muted"
        >
          Loading…
        </div>
        <div
          v-else-if="isContextEmpty"
          class="muted"
        >
          This Punk is not in any auction, lot, or offer.
        </div>
        <div
          v-else
          class="context"
        >
          <div
            v-if="punkAuctions.length"
            class="context-group"
          >
            <h3 class="context-title">In auction</h3>
            <div class="card-grid">
              <AuctionCard
                v-for="auction in punkAuctions"
                :key="String(auction.id)"
                :auction="auction"
              />
            </div>
          </div>
          <div
            v-if="punkLots.length"
            class="context-group"
          >
            <h3 class="context-title">In a lot</h3>
            <div class="card-grid">
              <LotCard
                v-for="lot in punkLots"
                :key="String(lot.id)"
                :lot="lot"
              />
            </div>
          </div>
          <div
            v-if="punkOffers.length"
            class="context-group"
          >
            <h3 class="context-title">Matching offers</h3>
            <div class="card-grid">
              <OfferCard
                v-for="offer in punkOffers"
                :key="String(offer.id)"
                :offer="offer"
              />
            </div>
          </div>
        </div>
      </section>
    </ClientOnly>
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
import { downloadPunkPng } from '~/utils/punkSnapshot'
import { PUNK_BG } from '~/utils/render'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const isV1 = computed(() => props.standard === TokenStandard.CryptoPunksV1)

const { backToSearchHref } = useSearchNavigation()
const offline = usePunksOffline()
const summary = computed(() =>
  offline.get(props.punkId, { includeTraits: true }),
)

type DisplayTrait = {
  id: number
  kind: string
  name: string
  supply: number
  query: string
}

/// HeadVariant trait rows are reframed as "Skin" using the Dark → Brown →
/// Fair → Albino vocabulary. Alien / Ape / Zombie punks have no skin tone, so
/// their head-variant row is dropped — the Type tag already covers them.
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
        { ...t, kind: 'Skin', name: tone, query: `${tone.toLowerCase()} skin` },
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
/// already, so their trait-list rows are hidden to avoid the dupe.
const HIDDEN_KINDS = new Set(['Skin', 'Type', 'Attributes'])
const visibleTraits = computed(() =>
  displayTraits.value.filter((t) => !HIDDEN_KINDS.has(t.kind)),
)

const skinTag = computed(() => {
  const tone = skinToneByHeadVariant[summary.value.headVariantName]
  if (!tone) return null
  return { label: `${tone} Skin`, query: `${tone.toLowerCase()} skin` }
})

function quoteIfMultiword(text: string) {
  return /\s/.test(text) ? `"${text}"` : text
}

const { owner, pending: ownerPending } = usePunkOwner(
  () => props.punkId,
  () => props.standard,
)
const ownerKnown = computed(
  () =>
    !!owner.value &&
    owner.value !== '0x0000000000000000000000000000000000000000',
)

const {
  punkAuctions,
  punkLots,
  punkOffers,
  pending: contextPending,
  deployed,
} = usePunkAuctionContext(
  () => props.punkId,
  () => props.standard,
)
const isContextEmpty = computed(
  () =>
    !punkAuctions.value.length &&
    !punkLots.value.length &&
    !punkOffers.value.length,
)

const downloading = ref(false)
async function downloadImage() {
  if (downloading.value) return
  downloading.value = true
  try {
    await downloadPunkPng(offline, props.punkId, {
      size: 2048,
      background: PUNK_BG,
    })
  } finally {
    downloading.value = false
  }
}

function searchHref(text: string) {
  return { path: '/', query: { q: text } }
}
</script>

<style scoped>
.punk-detail {
  padding: var(--size-6) 0 var(--size-8);
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

.hero-image {
  position: relative;
  align-self: start;
  aspect-ratio: 1/1;
}

.download-btn {
  position: absolute;
  top: var(--size-3);
  right: var(--size-3);
  opacity: 0.2;
  transition: opacity var(--speed) ease;
}

.hero-image:hover .download-btn,
.download-btn:focus-visible,
.download-btn:hover {
  opacity: 1;
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
  display: flex;
  align-items: center;
  gap: var(--size-2);
}

.v1-tag {
  font-size: 11px;
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
  border-bottom: 1px dashed var(--border-color);
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

.colors-row {
  align-items: center;
}

.trait-supply {
  margin-left: auto;
  font-size: 10px;
}

.owner-panel {
  display: flex;
  align-items: center;
  gap: var(--size-2);
}

.detail-section {
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

.context {
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.context-group {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.context-title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
