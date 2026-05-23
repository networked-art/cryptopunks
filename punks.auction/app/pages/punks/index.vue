<template>
  <div class="search-page">
    <PunkSearch :size="72" />
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
  width: 100%;
  padding: 0 var(--spacer) var(--size-4);
}
</style>
