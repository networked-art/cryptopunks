<template>
  <div class="lot-card-shell">
    <slot />
  </div>
</template>

<style scoped>
.lot-card-shell {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  block-size: 100%;
}
</style>
