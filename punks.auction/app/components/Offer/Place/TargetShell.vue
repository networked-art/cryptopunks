<template>
  <div class="target-shell">
    <slot />
  </div>
</template>

<style scoped>
.target-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--size-3);
  height: 100%;
  min-height: 0;
}

.target-shell :deep(.target-grid) {
  min-height: 0;
  padding: var(--border-width);
}
</style>
