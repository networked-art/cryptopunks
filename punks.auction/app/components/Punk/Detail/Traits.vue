<template>
  <section class="block">
    <ul class="trait-list">
      <li
        v-for="t in traits"
        :key="`${t.kind}-${t.id}`"
      >
        <span class="trait-kind eyebrow">{{ t.kind }}</span>
        <NuxtLink
          class="trait-name"
          :to="punkSearchHref(t.query)"
          >{{ t.name }}</NuxtLink
        >
        <span class="trait-supply muted">{{ t.supply.toLocaleString() }}</span>
      </li>
      <li>
        <span class="trait-kind eyebrow">Pixels</span>
        <NuxtLink
          class="trait-name"
          :to="punkSearchHref(`${summary.pixelCount} pixels`)"
          >{{ summary.pixelCount.toLocaleString() }} pixels</NuxtLink
        >
        <span class="trait-supply muted">{{
          pixelCountSupply.toLocaleString()
        }}</span>
      </li>
      <li>
        <span class="trait-kind eyebrow">Colors</span>
        <NuxtLink
          class="trait-name"
          :to="punkSearchHref(`${summary.colorCount} colors`)"
          >{{ summary.colorCount }} colors</NuxtLink
        >
        <span class="trait-supply muted">{{
          colorCountSupply.toLocaleString()
        }}</span>
      </li>
      <li class="colors-row">
        <span class="trait-kind eyebrow">Palette</span>
        <PunkColors :punk-id="punkId" />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { PunkSummary } from '@networked-art/punks-sdk'
import type { PunkDisplayTrait } from '~/composables/usePunkDisplayTraits'
import { punkSearchHref } from '~/utils/punkSearch'

const props = defineProps<{
  punkId: number
  summary: PunkSummary
  traits: PunkDisplayTrait[]
}>()

const offline = usePunksOffline()
const pixelCountSupply = computed(() =>
  offline.count({ pixelCount: props.summary.pixelCount }),
)
const colorCountSupply = computed(() =>
  offline.count({ colorCount: props.summary.colorCount }),
)
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

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
</style>
