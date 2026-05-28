<template>
  <Spinner
    v-if="iconKind === 'bid'"
    class="bid-mark"
    :loop="false"
    idle-pattern="arrow-up"
    decorative
  />
  <Spinner
    v-else-if="iconKind === 'lot'"
    class="lot-mark"
    :loop="false"
    idle-pattern="lot-create"
    decorative
  />
  <Spinner
    v-else-if="iconKind === 'auction'"
    class="auction-mark"
    :loop="false"
    idle-pattern="auction-start"
    decorative
  />
  <Spinner
    v-else-if="iconKind === 'collection-offer'"
    class="collection-mark"
    :loop="false"
    idle-pattern="full"
    decorative
  />
  <span
    v-else-if="iconKind === 'trait-offer'"
    class="selection-badge"
  >
    <Icon
      class="selection-check"
      name="lucide:check"
    />
  </span>
</template>

<script setup lang="ts">
export type ActivityRowMarkKind =
  | 'bid'
  | 'lot'
  | 'auction'
  | 'collection-offer'
  | 'trait-offer'

defineProps<{
  iconKind: ActivityRowMarkKind
}>()
</script>

<style scoped>
/* Mark sizing mirrors Offer/Target.vue so collection / trait / bid / lot /
 * auction icons all read at the same scale across the two surfaces. */
.bid-mark,
.collection-mark,
.lot-mark,
.auction-mark {
  --spinner-pixel: var(--size-1);
  --spinner-gap: var(--size-0);
  width: auto;
  height: auto;
}

.selection-badge {
  display: grid;
  place-items: center;
  inline-size: calc(3 * var(--size-1) + 2 * var(--size-0));
  block-size: calc(3 * var(--size-1) + 2 * var(--size-0));
  background: var(--primary);
  color: white;
}

.selection-check {
  font-size: var(--font-xs);
}
</style>
