<template>
  <li
    class="detail-row"
    :class="{ 'with-aside': $slots.aside }"
  >
    <slot name="main" />
    <slot name="aside" />
  </li>
</template>

<style scoped>
.detail-row {
  list-style: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2);
  border: var(--border);
  background: var(--bg-elevated);
}

.with-aside {
  grid-template-columns: minmax(0, 1fr) max-content;
  padding-right: var(--size-3);
}
</style>
