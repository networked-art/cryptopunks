<template>
  <section
    v-if="memberships.length"
    class="block punk-collections"
  >
    <h2 class="block-title eyebrow">Featured in</h2>
    <ul class="collection-list">
      <Card
        v-for="membership in memberships"
        :key="membership.collection.slug"
        as="li"
        class="collection-item"
      >
        <a
          :href="membership.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="collection-link"
        >
          <span class="collection-name">
            <span class="collection-title">{{
              membership.collection.title
            }}</span>
            <span
              v-if="subtitle(membership)"
              class="collection-subtitle"
              >{{ subtitle(membership) }}</span
            >
          </span>
          <span
            class="collection-arrow"
            aria-hidden="true"
            >↗</span
          >
        </a>
      </Card>
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

/* One framed Card per membership, stacked flush so multiple sets read as a
   single connected list — shared borders, only the outer corners rounded. */
.collection-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.collection-item {
  transition: background-color var(--speed);
}

.collection-item:not(:first-child) {
  border-top: 0;
}

.collection-item:not(:only-child):not(:last-child) {
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}

.collection-item:not(:only-child):not(:first-child) {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.collection-item:has(.collection-link:hover),
.collection-item:has(.collection-link:focus-visible) {
  background-color: var(--card-background-highlight);
}

.collection-link {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-3);
  width: 100%;
  border: 0;
  font-size: var(--font-sm);
}

.collection-name {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.collection-subtitle {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.collection-arrow {
  color: var(--text-dim);
}
</style>
