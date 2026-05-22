<template>
  <header class="head">
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
      <NuxtLink :to="punkSearchHref(summary.punkTypeName)">
        <Tag small>{{ summary.punkTypeName }}</Tag>
      </NuxtLink>
      <NuxtLink
        v-if="skinTag"
        :to="punkSearchHref(skinTag.query)"
      >
        <Tag small>{{ skinTag.label }}</Tag>
      </NuxtLink>
      <NuxtLink :to="punkSearchHref(`${summary.attributeCount} attributes`)">
        <Tag small
          >{{ summary.attributeCount }} attribute{{
            summary.attributeCount === 1 ? '' : 's'
          }}</Tag
        >
      </NuxtLink>
      <NuxtLink :to="punkSearchHref(`${summary.colorCount} colors`)">
        <Tag small>{{ summary.colorCount }} colors</Tag>
      </NuxtLink>
      <NuxtLink :to="punkSearchHref(`${summary.pixelCount} pixels`)">
        <Tag small>{{ summary.pixelCount }} px</Tag>
      </NuxtLink>
    </Tags>
  </header>
</template>

<script setup lang="ts">
import type { PunkSummary } from '@networked-art/punks-sdk'
import type { PunkSkinTag } from '~/composables/usePunkDisplayTraits'
import { punkSearchHref } from '~/utils/punkSearch'

defineProps<{
  punkId: number
  isV1: boolean
  summary: PunkSummary
  skinTag: PunkSkinTag | null
}>()
</script>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
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

@media (max-width: 860px) {
  .title {
    font-size: 28px;
  }
}
</style>
