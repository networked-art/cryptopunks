<template>
  <span class="liveness-indicator">
    <span
      class="liveness-indicator-dot"
      aria-hidden="true"
    />
    <span class="liveness-indicator-label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
  }>(),
  {
    label: 'Live',
  },
)
</script>

<style scoped>
.liveness-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.liveness-indicator-dot {
  inline-size: 0.36rem;
  block-size: 0.36rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-strong);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.liveness-indicator-label {
  position: absolute;
  overflow: hidden;
  clip: rect(0 0 0 0);
  inline-size: 1px;
  block-size: 1px;
  white-space: nowrap;
}
</style>
