<template>
  <section class="block">
    <h2 class="block-title eyebrow">Owned by</h2>
    <ClientOnly>
      <NuxtLink
        v-if="ownerKnown"
        :to="`/profile/${owner}`"
        class="owner-account"
      >
        <Account :address="owner!" />
      </NuxtLink>
      <span
        v-else-if="ownerPending"
        class="block-note muted"
        >Loading…</span
      >
      <span
        v-else
        class="block-note muted"
        >Unclaimed</span
      >
      <template #fallback>
        <span class="block-note muted">…</span>
      </template>
    </ClientOnly>
  </section>
</template>

<script setup lang="ts">
import type { TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const { owner, pending: ownerPending } = usePunkOwner(
  () => props.punkId,
  () => props.standard,
)
const ownerKnown = computed(
  () =>
    !!owner.value &&
    owner.value !== '0x0000000000000000000000000000000000000000',
)
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
  font-size: var(--font-sm);
}

.owner-account {
  border: 0;
  min-width: 0;
}
</style>
