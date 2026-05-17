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
  padding-bottom: var(--space-4);
}
</style>
