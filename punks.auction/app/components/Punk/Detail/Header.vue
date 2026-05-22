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
  </header>
</template>

<script setup lang="ts">
defineProps<{
  punkId: number
  isV1: boolean
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

@media (max-width: 860px) {
  .title {
    font-size: 28px;
  }
}
</style>
