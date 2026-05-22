<template>
  <article class="punk-detail">
    <PunkDetailStage
      :punk-id="punkId"
      :standard="standard"
    />

    <section class="panel">
      <div class="panel-inner">
        <PunkDetailHeader
          :punk-id="punkId"
          :is-v1="isV1"
          :summary="summary"
          :skin-tag="skinTag"
        />
        <PunkDetailOwner
          :punk-id="punkId"
          :standard="standard"
        />
        <PunkDetailAuction
          :punk-id="punkId"
          :standard="standard"
        />
        <PunkDetailTraits
          :punk-id="punkId"
          :traits="visibleTraits"
        />
        <PunkDetailHistory
          v-if="!isV1"
          :punk-id="punkId"
        />
        <PunkDetailFooter :punk-id="punkId" />
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
const { skinTag, visibleTraits } = usePunkDisplayTraits(summary)
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
  gap: var(--size-7);
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding: var(--size-7) var(--size-6) var(--size-9);
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
