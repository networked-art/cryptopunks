<template>
  <article class="punk-detail">
    <PunkDetailStage
      :punk-id="punkId"
      :standard="standard"
      :highlighted-color="highlightedColor"
    />

    <section class="panel">
      <div class="panel-inner">
        <PunkDetailHeader
          :punk-id="punkId"
          :is-v1="isV1"
        />
        <PunkDetailTraits
          :punk-id="punkId"
          :summary="summary"
          :traits="displayTraits"
          @highlight-color="setHighlightedColor"
        />
        <PunkDetailOwner
          :key="`owner-${marketChangeKey}`"
          :punk-id="punkId"
          :standard="standard"
        />
        <LazyPunkDetailAuction
          :key="`auction-${marketChangeKey}`"
          :punk-id="punkId"
          :standard="standard"
          @changed="onMarketChanged"
        />
        <LazyPunkDetailMarket
          v-if="!isV1"
          :key="`market-${marketChangeKey}`"
          :punk-id="punkId"
          @changed="onMarketChanged"
        />
        <LazyPunkDetailOwnerActions
          v-if="!isV1"
          :key="`owner-actions-${marketChangeKey}`"
          :punk-id="punkId"
          :standard="standard"
          @changed="onMarketChanged"
        />
        <PunkDetailCollections
          :punk-id="punkId"
          :standard="standard"
        />
        <LazyPunkDetailHistory
          v-if="!isV1"
          :key="`history-${marketChangeKey}`"
          :punk-id="punkId"
        />
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const isV1 = computed(() => props.standard === TokenStandard.CryptoPunksV1)
const offline = usePunksOffline()
const summary = computed(() =>
  offline.get(props.punkId, { includeTraits: true }),
)
const { displayTraits } = usePunkDisplayTraits(summary)
const marketChangeKey = ref(0)
const highlightedColor = ref<string | null>(null)
const detailData = usePunkDetailData(
  () => props.punkId,
  () => props.standard,
)
providePunkDetailData(detailData)

function onMarketChanged() {
  marketChangeKey.value += 1
  void detailData.refresh()
}

function setHighlightedColor(color: string | null) {
  highlightedColor.value = color
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

.panel {
  display: flex;
  align-items: center;
  min-width: 0;
}

.panel-inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding: var(--size-7) var(--size-6) var(--size-9);
}

.panel-inner > * + * {
  margin-top: var(--size-7);
}

.panel-inner > :nth-child(2) {
  margin-top: var(--size-4);
}

@media (max-width: 860px) {
  .punk-detail {
    grid-template-columns: 1fr;
  }

  .panel-inner {
    padding: var(--size-6) var(--size-5) var(--size-8);
  }
}
</style>
