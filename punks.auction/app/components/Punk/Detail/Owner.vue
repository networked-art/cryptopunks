<template>
  <section class="block">
    <h2 class="block-title eyebrow">
      Owned by
      <span v-if="custodyHint">({{ custodyHint }})</span>
    </h2>
    <ClientOnly>
      <div
        v-if="ownerKnown"
        class="owner-row"
      >
        <NuxtLink
          :to="`/profile/${owner}`"
          class="owner-account"
        >
          <Account :address="owner!" />
        </NuxtLink>
      </div>
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

defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const detail = usePunkDetailDataContext()
const { owner, isWrapped, isVaulted, isStashed, ownerPending } = detail
const ownerKnown = computed(
  () =>
    !!owner.value &&
    owner.value !== '0x0000000000000000000000000000000000000000',
)
const custodyHint = computed(() => {
  if (isVaulted.value) return 'Vaulted'
  if (isStashed.value) return 'Stashed'
  if (isWrapped.value) return 'Wrapped'
  return null
})
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

.owner-row {
  display: flex;
  align-items: baseline;
  gap: var(--size-3);
  min-width: 0;
}

.owner-account {
  border: 0;
  min-width: 0;
}
</style>
