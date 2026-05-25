<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="wrappers-tab"
    >
      <ProfileVaultMovement :account="ownAccount" />

      <ProfileStashMovement
        :account="ownAccount"
        :stash="stash"
        :stash-deployed="stashDeployed"
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

const { ownAccount, stash, stashDeployed, wrapperProxy } = useProfileContext()
</script>

<style scoped>
.wrappers-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}
</style>
