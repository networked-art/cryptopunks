<template>
  <section
    v-if="memberships.length"
    class="block punk-collections"
  >
    <h2 class="block-title eyebrow">Featured in</h2>
    <ul class="collection-list">
      <PunkCollectionCard
        v-for="membership in memberships"
        :key="membership.collection.slug"
        as="li"
        :title="membership.collection.title"
        :subtitle="subtitle(membership)"
        :href="membership.sourceUrl"
      />
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { CuratedCollectionMembership } from '@networked-art/punks-sdk'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const offline = usePunksOffline()

// Curated collections are attributed to CryptoPunks (v2); skip the lookup for
// V1 Punks so it never shows a mismatched set.
const memberships = computed<CuratedCollectionMembership[]>(() =>
  props.standard === TokenStandard.CryptoPunks
    ? offline.collections.forPunk(props.punkId)
    : [],
)

// The greyed sub-line: the institutions that hold this Punk when the collection
// nests sub-sets (e.g. ZKM within Museum Punks), otherwise the collection's
// own description.
function subtitle(membership: CuratedCollectionMembership): string {
  const institutions = membership.institutions
    .map((institution) => institution.title)
    .join(', ')
  return institutions || membership.collection.description
}
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

/* The cards stack flush so multiple sets read as one connected list: collapse
   the doubled border between adjacent cards. */
.collection-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.collection-list .collection-card:not(:first-child) {
  border-top: 0;
}
</style>
