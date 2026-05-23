<template>
  <section class="block">
    <h2 class="block-title eyebrow">History</h2>
    <ClientOnly>
      <PunkHistory :punk-id="punkId" />
      <template #fallback>
        <p class="block-note muted">Loading history…</p>
      </template>
    </ClientOnly>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  punkId: number
}>()
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.block-note {
  margin: 0;
  font-size: 12px;
}
</style>
