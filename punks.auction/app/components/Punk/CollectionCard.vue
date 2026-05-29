<template>
  <Card
    :as="as"
    class="collection-card"
  >
    <span
      class="collection-arrow"
      aria-hidden="true"
      >↗</span
    >
    <span class="collection-title">{{ title }}</span>
    <span
      v-if="subtitle"
      class="collection-subtitle"
      >{{ subtitle }}</span
    >
    <CardLink
      :to="href"
      :title="title"
      target="_blank"
      rel="noopener noreferrer"
    />
  </Card>
</template>

<script setup lang="ts">
// Framed, whole-card-clickable curated-collection card shared by the search
// page and the punk detail page. CardLink overlays the card (so the entire
// surface links out) and the arrow floats top-right.
withDefaults(
  defineProps<{
    title: string
    href: string
    subtitle?: string
    as?: string
  }>(),
  { as: 'article', subtitle: '' },
)
</script>

<style scoped>
.collection-card {
  position: relative;
  gap: var(--size-1);
  font-size: var(--font-sm);
}

.collection-arrow {
  position: absolute;
  inline-size: auto;
  inset-block-start: var(--spacer);
  inset-inline-end: var(--spacer);
  color: var(--text-dim);
  transition: color var(--speed);
}

.collection-title {
  /* leave room for the floating arrow */
  padding-inline-end: var(--size-5);
  transition: color var(--speed);
}

.collection-subtitle {
  color: var(--text-dim);
  font-size: var(--font-xs);
  transition: color var(--speed);
}

/* Hover: white surface, accent title + arrow, dark description. The border
   color stays as the resting frame (no highlight) and there's no shadow. */
.collection-card:has(> .card-link:hover),
.collection-card:has(> .card-link:focus-visible) {
  background-color: var(--white);
  border-color: var(--border-color);
  box-shadow: none;
}

.collection-card:has(> .card-link:hover) .collection-title,
.collection-card:has(> .card-link:focus-visible) .collection-title,
.collection-card:has(> .card-link:hover) .collection-arrow,
.collection-card:has(> .card-link:focus-visible) .collection-arrow {
  color: var(--accent);
}

.collection-card:has(> .card-link:hover) .collection-subtitle,
.collection-card:has(> .card-link:focus-visible) .collection-subtitle {
  color: var(--black);
}
</style>
