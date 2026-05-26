<template>
  <ClientOnly>
    <section
      v-if="ownAccount"
      class="vault-tab"
    >
      <ProfileVaultControls :account="ownAccount" />

      <ProfileVaultMovement :account="ownAccount" />

      <LazyProfileAddresses
        :account="ownAccount"
        :vault="vault"
        :stash="stash"
        :wrapper-proxy="wrapperProxy"
        :vault-deployed="vaultDeployed"
        :stash-deployed="stashDeployed"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
useOwnProfileGuard()

const {
  ownAccount,
  vault,
  stash,
  wrapperProxy,
  vaultDeployed,
  stashDeployed,
} = useProfileContext()
</script>

<style scoped>
.vault-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-4);
}
</style>
