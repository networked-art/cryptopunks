<template>
  <article class="punk-detail">
    <aside class="stage">
      <div class="stage-inner">
        <figure class="frame">
          <div class="art-box">
            <PunkImage
              :punk-id="punkId"
              :standard="standard"
              size="100%"
            />
          </div>
        </figure>
        <ClientOnly>
          <Button
            class="download small"
            :disabled="downloading"
            title="Download PNG"
            aria-label="Download PNG"
            @click="downloadImage"
          >
            <Icon :name="downloading ? 'lucide:loader' : 'lucide:download'" />
          </Button>
        </ClientOnly>
      </div>
    </aside>

    <section class="panel">
      <div class="panel-inner">
        <header class="head">
          <NuxtLink
            :to="backToSearchHref"
            class="back"
            >← Back to search</NuxtLink
          >

          <h1 class="title">
            Punk <span class="dim">#</span>{{ punkId }}
            <Tag
              v-if="isV1"
              small
              class="v1-tag"
              >V1</Tag
            >
          </h1>

          <Tags class="meta">
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
        </header>

        <ClientOnly>
          <div class="owner">
            <span class="owner-label">Owned by</span>
            <NuxtLink
              v-if="ownerKnown"
              :to="`/profile/${owner}`"
              class="owner-account"
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
          <template #fallback>
            <div class="owner">
              <span class="owner-label">Owned by</span>
              <span class="muted">…</span>
            </div>
          </template>
        </ClientOnly>

        <ClientOnly>
          <section class="block">
            <h2 class="block-title">On the auction house</h2>
            <p
              v-if="!deployed"
              class="block-note muted"
            >
              <code>PunksAuction</code> is not deployed yet.
            </p>
            <p
              v-else-if="contextPending && isContextEmpty"
              class="block-note muted"
            >
              Loading…
            </p>
            <p
              v-else-if="isContextEmpty"
              class="block-note muted"
            >
              This Punk is not in any auction, lot, or offer.
            </p>
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

        <section class="block">
          <h2 class="block-title">Traits</h2>
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
              <span class="trait-supply muted">{{ t.supply }}</span>
            </li>
            <li class="colors-row">
              <span class="trait-kind">Colors</span>
              <PunkColors :punk-id="punkId" />
            </li>
          </ul>
        </section>

        <section
          v-if="!isV1"
          class="block"
        >
          <h2 class="block-title">History</h2>
          <ClientOnly>
            <PunkHistory :punk-id="punkId" />
            <template #fallback>
              <p class="block-note muted">Loading history…</p>
            </template>
          </ClientOnly>
        </section>

        <footer class="provenance">
          <span>Ethereum mainnet</span>
          <a
            :href="contractHref"
            target="_blank"
            rel="noopener noreferrer"
          >
            View contract
            <Icon name="lucide:external-link" />
          </a>
        </footer>
      </div>
    </section>
  </article>
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
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { CRYPTOPUNKS_ADDRESS, PUNKS_V1_ADDRESS } from '~/utils/addresses'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const isV1 = computed(() => props.standard === TokenStandard.CryptoPunksV1)
const contractHref = computed(() =>
  addressUrl(isV1.value ? PUNKS_V1_ADDRESS : CRYPTOPUNKS_ADDRESS),
)

const { backToSearchHref } = useSearchNavigation()
const offline = usePunksOffline()
const { backgroundForPunk } = usePunkBackgrounds()
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
      background: backgroundForPunk(props.punkId, props.standard),
    })
  } finally {
    downloading.value = false
  }
}

function searchHref(text: string) {
  return { path: '/punks', query: { q: text } }
}
</script>

<style scoped>
.punk-detail {
  --app-header-height: 57px;

  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
}

/* ── Left: the gallery frame ─────────────────────────────────────────── */

.stage {
  background: var(--gray-z-2);
  border-right: var(--border);
}

.stage-inner {
  position: sticky;
  top: var(--app-header-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100dvh - var(--app-header-height));
  padding: var(--size-6);
}

.frame {
  position: relative;
  margin: 0;
  padding: clamp(var(--size-3), 2.4vw, var(--size-6));
  background: #fff;
  border: var(--border);
  box-shadow:
    0 1px 2px rgba(10, 10, 18, 0.05),
    0 24px 48px -28px rgba(10, 10, 18, 0.4);
}

.art-box {
  display: block;
  width: min(420px, 42vw, 52vh);
  aspect-ratio: 1;
  font-size: 0;
}

.art-box :deep(.punk-image) {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 0;
}

.download {
  position: absolute;
  right: var(--size-5);
  bottom: var(--size-5);
  opacity: 0.25;
  transition: opacity var(--speed, 0.15s) ease;
}

.stage-inner:hover .download,
.download:focus-visible,
.download:hover {
  opacity: 1;
}

/* ── Right: details + history ────────────────────────────────────────── */

.panel {
  min-width: 0;
}

.panel-inner {
  display: flex;
  flex-direction: column;
  gap: var(--size-7);
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding: var(--size-7) var(--size-6) var(--size-9);
}

.head {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.back {
  align-self: flex-start;
  border: 0;
  color: var(--text-dim);
  font-size: 12px;
}

.back:hover {
  color: var(--accent);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  margin: 0;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.v1-tag {
  font-size: 11px;
}

.meta {
  margin-top: var(--size-1);
}

/* Owner ledger box */

.owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-3) var(--size-4);
  border: var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 12px;
}

.owner-label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  color: var(--text-dim);
}

.owner-account {
  border: 0;
  min-width: 0;
}

/* Sections */

.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.block-note {
  margin: 0;
  font-size: 12px;
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
  color: var(--text-muted);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--size-3);
}

/* Traits */

.trait-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
}

.trait-list li {
  display: flex;
  align-items: baseline;
  gap: var(--size-3);
  padding: var(--size-2) 0;
  border-bottom: 1px dashed var(--border-color);
}

.trait-list li:last-child {
  border-bottom: 0;
}

.trait-kind {
  flex-shrink: 0;
  width: 84px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  color: var(--text-dim);
}

.trait-name {
  border: 0;
  color: inherit;
  box-shadow: inset 0 -1px 0 transparent;
}

.trait-name:hover {
  box-shadow: inset 0 -1px 0 currentColor;
}

.trait-supply {
  margin-left: auto;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.colors-row {
  align-items: center !important;
}

/* Provenance footer */

.provenance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding-top: var(--size-4);
  border-top: var(--border);
  color: var(--text-dim);
  font-size: 12px;
}

.provenance a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  color: var(--text-muted);
}

.provenance a:hover {
  color: var(--accent);
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

/* ── Stacked layout ──────────────────────────────────────────────────── */

@media (max-width: 860px) {
  .punk-detail {
    grid-template-columns: 1fr;
  }

  .stage {
    border-right: 0;
    border-bottom: var(--border);
  }

  .stage-inner {
    position: relative;
    height: auto;
    padding: var(--size-7) var(--size-5);
  }

  .art-box {
    width: min(380px, 72vw);
  }

  .panel-inner {
    padding: var(--size-6) var(--size-5) var(--size-8);
  }

  .title {
    font-size: 28px;
  }
}
</style>
