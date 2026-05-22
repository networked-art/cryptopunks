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
const titleFor = (suffix: string) =>
  query.value ? `${query.value} · ${suffix}` : `Browse Punks · ${suffix}`

useSeoMeta({
  title: () => titleFor('Punks Auction'),
  ogTitle: () => titleFor('Punks Auction'),
  twitterTitle: () => titleFor('Punks Auction'),
})
</script>

<style scoped>
.search-page {
  padding-bottom: var(--size-4);
}
</style>
