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
  inline-size: calc(0.36rem + 4px);
  block-size: calc(0.36rem + 4px);
  flex: 0 0 auto;
  padding: 2px;
  background: var(--accent-soft);
  clip-path: circle(50%);
}

.liveness-indicator-dot::before {
  content: '';
  display: block;
  inline-size: 100%;
  block-size: 100%;
  background: var(--accent-strong);
  clip-path: circle(50%);
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
