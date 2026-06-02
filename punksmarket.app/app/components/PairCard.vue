<template>
  <article class="pair-card">
    <div class="pair-bodies">
      <div class="side">
        <span
          class="punk-tile"
          :style="canonicalStyle"
          :title="`Canonical CryptoPunks #${punkId} — the fixed June 22nd 2017 redeploy`"
        />
        <span class="side-label">
          <span>Canonical</span>
          <Tag
            v-if="canonical.isWrapped"
            small
            :title="wrapperTitle(canonical.wrapper)"
            >wrapped</Tag
          >
        </span>
      </div>

      <span
        class="bridge"
        aria-hidden="true"
        >⟷</span
      >

      <NuxtLink
        class="side original-side"
        :to="`/punk/${punkId}`"
        :title="`The original June 9th 2017 CryptoPunks #${punkId}`"
      >
        <span
          class="punk-tile"
          :style="originalStyle"
        />
        <span class="side-label">
          <span class="glitch-name">{{ ORIGINAL_NAME }}</span>
          <Tag
            v-if="original.isWrapped"
            small
            :title="wrapperTitle(original.wrapper)"
            >wrapped</Tag
          >
        </span>
      </NuxtLink>
    </div>

    <footer class="pair-meta">
      <NuxtLink
        class="punk-id"
        :to="`/punk/${punkId}`"
        >#{{ punkId }}</NuxtLink
      >
      <NuxtLink
        class="owner"
        :to="`/profile/${owner}`"
        title="Holds both the canonical and original of this punk"
      >
        <AccountBadge :address="owner" />
      </NuxtLink>
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { punkSpriteBackgroundStyle } from '~/utils/punkSprites'
import { WRAPPED_BG, UNWRAPPED_BG } from '~/composables/useWrappedPunks'
import type { PairCollectionState } from '~/composables/usePunkPairs'

const props = withDefaults(
  defineProps<{
    punkId: number
    owner: Address
    canonical: PairCollectionState
    original: PairCollectionState
    size?: number
  }>(),
  { size: 84 },
)

/// The iconic CryptoPunks teal marks the canonical tile as the unbroken
/// collection, set clean against the glitched original beside it.
const CANONICAL_BG = '#638596'

/// The same zalgo "CryptoPunks" the V1 panel uses, so the original collection
/// reads with the broken-glyph treatment wherever it's named.
const ORIGINAL_NAME = 'Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs'

const spriteLayers = usePunkSpriteLayers()

/// Canonical renders from the bare base sprite — no glitch layers — which is
/// what visually separates it from the original.
const canonicalStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  backgroundColor: CANONICAL_BG,
  ...punkSpriteBackgroundStyle(props.punkId, props.size),
}))

const originalStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  backgroundColor: props.original.isWrapped ? WRAPPED_BG : UNWRAPPED_BG,
  ...punkSpriteBackgroundStyle(props.punkId, props.size, {
    stripes: spriteLayers.stripesLoaded.value,
    outline: spriteLayers.outlineLoaded.value,
  }),
}))

function wrapperTitle(wrapper: string | null): string {
  switch (wrapper) {
    case 'wrapped_punks':
      return 'Wrapped in WrappedPunk'
    case 'cryptopunks_721':
      return 'Wrapped in CryptoPunks721'
    case 'v1_wrapper':
      return 'Wrapped in PunksV1Wrapper'
    default:
      return 'Wrapped'
  }
}
</script>

<style scoped>
.pair-card {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
}

.pair-bodies {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: var(--size-2);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-2);
  border: 0;
  color: var(--text-muted);
}

.punk-tile {
  display: block;
  image-rendering: pixelated;
  background-repeat: no-repeat;
  border: 0;
  flex-shrink: 0;
}

.original-side {
  transition: color 0.08s ease;
}

.original-side .punk-tile {
  transition: transform 0.08s ease;
}

.original-side:hover,
.original-side:focus-visible {
  color: var(--text);
}

.original-side:hover .punk-tile,
.original-side:focus-visible .punk-tile {
  transform: scale(1.08);
  outline: 2px solid var(--text);
  z-index: 1;
}

.side-label {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.glitch-name {
  text-transform: none;
  letter-spacing: 0;
}

.bridge {
  align-self: center;
  margin-top: calc(var(--size-2) * -1);
  color: var(--text-dim);
  font-size: 14px;
}

.pair-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
  border-top: var(--border);
  padding-top: var(--size-2);
}

.punk-id {
  border: 0;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.punk-id:hover {
  color: var(--accent);
}

.owner {
  border: 0;
  min-width: 0;
}
</style>
