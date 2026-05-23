<template>
  <div class="container settings-page">
    <header class="page-head">
      <h1>Settings</h1>
      <p class="muted">Local preferences for this device.</p>
    </header>

    <ClientOnly>
      <section class="settings-section">
        <h2 class="section-title eyebrow">Wallet</h2>
        <p
          v-if="address"
          class="muted setting-status"
        >
          Connected as <code>{{ shortAddr }}</code>
        </p>
        <p
          v-else
          class="muted setting-status"
        >
          No wallet connected.
        </p>

        <Button
          v-if="address"
          class="danger"
          @click="disconnect()"
        >
          <Icon name="lucide:log-out" />
          <span>Sign out</span>
        </Button>
      </section>

      <section class="settings-section">
        <h2 class="section-title eyebrow">Rendering</h2>
        <label class="setting-row">
          <input
            v-model="renderV1"
            type="checkbox"
          />
          <span class="setting-text">
            <strong>Render V1 Punks</strong>
            <span class="muted small">
              Show items from the original June 9th 2017 market alongside the
              canonical CryptoPunks. Off by default.
            </span>
          </span>
        </label>
      </section>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { useConnection, useDisconnect } from '@wagmi/vue'
import { shortAddress } from '@1001-digital/components.evm'

const { address } = useConnection()
const { mutate: disconnect } = useDisconnect()

const shortAddr = computed(() =>
  address.value ? shortAddress(address.value) : '',
)

const renderV1 = useV1Rendering()

useSeoMeta({
  title: 'Settings · Punks Auction',
  ogTitle: 'Settings · Punks Auction',
  twitterTitle: 'Settings · Punks Auction',
})
</script>

<style scoped>
.settings-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
  max-width: 560px;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.page-head h1 {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
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

.setting-row {
  display: flex;
  align-items: flex-start;
  gap: var(--size-3);
  cursor: pointer;
}

.setting-row input[type='checkbox'] {
  margin-top: var(--size-1);
  flex-shrink: 0;
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-0);
  font-size: var(--font-base);
  line-height: var(--line-height-snug);
}

.setting-text .small {
  font-size: var(--font-sm);
}
</style>
