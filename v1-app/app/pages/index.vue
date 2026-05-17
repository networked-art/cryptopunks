<template>
  <div class="container search-page">
    <PunkSearch :size="56" />
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Search · punksmarket.xyz' })
</script>

<style scoped>
.search-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
  min-height: 0;
  gap: var(--space-3);
}
</style>
