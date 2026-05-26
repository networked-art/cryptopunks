<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="wrappers-tab"
    >
      <ProfileVaultMovement :account="ownAccount" />

      <ProfileStashMovement
        :account="ownAccount"
        @changed="refreshAddresses"
      />

      <ProfileLegacyWrapper
        :account="ownAccount"
        :wrapper-proxy="wrapperProxy"
      />
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
useOwnProfileGuard()

const { ownAccount, wrapperProxy, refreshAddresses } = useProfileContext()
</script>

<style scoped>
.wrappers-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}
</style>
