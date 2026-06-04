<template>
  <header class="head">
    <div class="title-row">
      <h1 class="title">
        Punk <span class="dim">#</span>{{ punkId }}
        <Tag
          v-if="isV1"
          small
          class="v1-tag"
          >V1</Tag
        >
      </h1>
      <PunkDetailWatchStar
        v-if="watchEnabled"
        :punk-id="punkId"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { isApiConfigured } from '~/utils/api'

defineProps<{
  punkId: number
  isV1: boolean
}>()

// The watch star rides on the networked.art API; hide it unless that's wired up.
const watchEnabled = isApiConfigured()
</script>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  margin: 0;
  font-size: var(--font-3xl);
  font-weight: var(--font-weight-bolder);
  letter-spacing: var(--letter-spacing-tighter);
}

.v1-tag {
  font-size: var(--font-xs);
}

@media (max-width: 860px) {
  .title {
    font-size: var(--font-2xl);
  }
}
</style>
