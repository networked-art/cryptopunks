<template>
  <ClientOnly>
    <section
      v-if="ownAccount"
      class="tab-placeholder muted"
    >
      Bidirectional offer management lands here in the next pass.
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
useOwnProfileGuard()
const { ownAccount } = useProfileContext()
</script>

<style scoped>
.tab-placeholder {
  padding: var(--size-6);
  border: var(--border);
  text-align: center;
  font-size: var(--font-sm);
}
</style>
