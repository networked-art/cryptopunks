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
        @changed="onLegacyChanged"
      />
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { Address, Hash } from 'viem'

useOwnProfileGuard()

const { ownAccount, wrapperProxy, refreshAddresses } = useProfileContext()

function onLegacyChanged(_tx: Hash, nextWrapperProxy?: Address | null) {
  if (nextWrapperProxy !== undefined) {
    wrapperProxy.value = nextWrapperProxy
    return
  }

  void refreshAddresses()
}
</script>

<style scoped>
.wrappers-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}
</style>
