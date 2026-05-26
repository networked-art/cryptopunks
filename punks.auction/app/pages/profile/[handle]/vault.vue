<template>
  <ClientOnly>
    <section
      v-if="ownAccount"
      class="vault-tab"
    >
      <ProfileVaultControls :account="ownAccount" />

      <ProfileVaultMovement :account="ownAccount" />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
useOwnProfileGuard()

const { ownAccount } = useProfileContext()
</script>

<style scoped>
.vault-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}
</style>
