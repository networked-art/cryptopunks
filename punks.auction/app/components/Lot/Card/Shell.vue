<template>
  <Card class="lot-card-shell">
    <slot />
  </Card>
</template>

<style scoped>
.lot-card-shell {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
  block-size: 100%;
}
</style>
