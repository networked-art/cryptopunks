<template>
  <div class="container search-page">
    <PunkSearch :size="56" />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const query = computed(() =>
  typeof route.query.q === 'string' ? route.query.q.trim() : '',
)
useSeoMeta({
  title: () =>
    query.value
      ? `${query.value} · punksmarket.app`
      : 'Search · punksmarket.app',
  ogTitle: () =>
    query.value ? `${query.value} · punksmarket.app` : 'punksmarket.app',
  twitterTitle: () =>
    query.value ? `${query.value} · punksmarket.app` : 'punksmarket.app',
})
</script>

<style scoped>
.search-page {
  padding-bottom: var(--size-4);
}
</style>
