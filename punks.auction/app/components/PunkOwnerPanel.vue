<template>
  <ClientOnly>
    <div class="owner">
      <span class="owner-label">Owned by</span>
      <NuxtLink
        v-if="ownerKnown"
        :to="`/profile/${owner}`"
        class="owner-account"
      >
        <AccountBadge :address="owner!" />
      </NuxtLink>
      <span
        v-else-if="ownerPending"
        class="muted"
        >Loading…</span
      >
      <span
        v-else
        class="muted"
        >Unclaimed</span
      >
    </div>
    <template #fallback>
      <div class="owner">
        <span class="owner-label">Owned by</span>
        <span class="muted">…</span>
      </div>
    </template>
  </ClientOnly>
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
.owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-3) var(--size-4);
  border: var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 12px;
}

.owner-label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  color: var(--text-dim);
}

.owner-account {
  border: 0;
  min-width: 0;
}
</style>
