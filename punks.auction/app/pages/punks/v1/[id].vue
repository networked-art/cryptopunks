<template>
  <PunkDetail
    v-if="validId"
    :punk-id="id"
    :standard="TokenStandard.CryptoPunksV1"
  />
  <div
    v-else
    class="not-found muted"
  >
    V1 Punk #{{ route.params.id }} does not exist. Punk ids run 0–9999.
  </div>
</template>

<script setup lang="ts">
import { TokenStandard } from '~/utils/auction'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const validId = computed(
  () => Number.isInteger(id.value) && id.value >= 0 && id.value <= 9999,
)

useSeoMeta({
  title: () => `V1 Punk #${id.value} · Punks Auction`,
  ogTitle: () => `V1 Punk #${id.value} · Punks Auction`,
  twitterTitle: () => `V1 Punk #${id.value} · Punks Auction`,
})
</script>

<style scoped>
.not-found {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: var(--size-8);
  text-align: center;
}
</style>
