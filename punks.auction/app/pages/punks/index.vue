<template>
  <div class="search-page">
    <PunkSearch :size="72" />
  </div>
</template>

<script setup lang="ts">
import { titleCase } from '@networked-art/punks-sdk'
import { resolveSearchOg, searchOgDescription } from '~/utils/searchOg'

const route = useRoute()
const query = computed(() =>
  typeof route.query.q === 'string' ? route.query.q.trim() : '',
)
const sale = computed(() => route.query.sale === '1')
const description = computed(() =>
  searchOgDescription(query.value, { sale: sale.value }),
)
const titleFor = (suffix: string) =>
  query.value
    ? `${titleCase(query.value)} · ${suffix}`
    : sale.value
      ? `Listed Punks · ${suffix}`
      : `Browse Punks · ${suffix}`

useSeoMeta({
  title: () => titleFor('Punks Auction'),
  description: () => description.value,
  ogTitle: () => titleFor('Punks Auction'),
  ogDescription: () => description.value,
  twitterTitle: () => titleFor('Punks Auction'),
  twitterDescription: () => description.value,
})

const { data: ogSearch } = await useAsyncData(
  () => `og-search-${query.value}-${sale.value ? 'sale' : 'all'}`,
  () => resolveSearchOg({ q: query.value, sale: sale.value }),
)

if (ogSearch.value) {
  defineOgImage('Search', {
    gridSrc: searchGridSrc(query.value, sale.value),
  })
}

function searchGridSrc(q: string, sale: boolean): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (sale) params.set('sale', '1')
  return `/og/search-grid.png?${params.toString()}`
}
</script>

<style scoped>
.search-page {
  width: 100%;
  padding: 0 var(--spacer) var(--size-4);
}
</style>
