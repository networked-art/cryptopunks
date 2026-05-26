<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="settings-tab"
    >
      <section
        v-if="dev"
        class="settings-section"
      >
        <h2 class="section-title eyebrow">Network</h2>
        <EvmSwitchNetwork class-name="block">
          <template #default="{ currentChain }">
            <Icon name="wallet" />
            <span>Switch Network ({{ currentChain?.name || 'Unknown' }})</span>
          </template>
        </EvmSwitchNetwork>
      </section>

      <section class="settings-section">
        <h2 class="section-title eyebrow">Wallet</h2>
        <p class="muted setting-status">
          Connected as <code>{{ shortAddr }}</code>
        </p>

        <Button
          class="danger"
          @click="disconnect()"
        >
          <Icon name="lucide:log-out" />
          <span>Sign out</span>
        </Button>
      </section>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useDisconnect } from '@wagmi/vue'
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'

useOwnProfileGuard()

const { ownAccount } = useProfileContext()
const { mutate: disconnect } = useDisconnect()

const dev = import.meta.dev

const shortAddr = computed(() =>
  ownAccount.value ? shortAddress(ownAccount.value) : '',
)
</script>

<style scoped>
.settings-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
  max-width: 560px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.setting-status {
  margin: 0;
  font-size: var(--font-md);
}
</style>
