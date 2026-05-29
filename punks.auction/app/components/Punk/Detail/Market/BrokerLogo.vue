<template>
  <!-- eslint-disable-next-line vue/no-v-html -- trusted SVG from runtime config, not user input -->
  <span
    class="broker-logo"
    role="img"
    :aria-label="`${broker.name} logo`"
    v-html="broker.logo"
  />
</template>

<script setup lang="ts">
// Brand mark is supplied via runtime config (NUXT_PUBLIC_BROKER_LOGO), so the
// preview can be re-skinned per deployment without touching the component.
const broker = useRuntimeConfig().public.broker as { name: string; logo: string }
</script>

<style scoped>
.broker-logo {
  display: inline-flex;
  color: var(--text, #030301);
}

.broker-logo :deep(svg) {
  display: block;
  width: auto;
  height: 0.875rem;
}
</style>
