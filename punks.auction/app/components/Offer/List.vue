<template>
  <div class="offer-list">
    <slot />
  </div>
</template>

<style scoped>
.offer-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-shadow: var(--shadow, 0 6px 16px rgb(10 10 18 / 8%));
}
</style>
