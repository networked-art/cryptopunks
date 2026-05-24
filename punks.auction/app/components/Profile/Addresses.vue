<template>
  <ClientOnly>
    <section
      v-if="account"
      class="profile-addresses"
    >
      <h2 class="section-title eyebrow">Addresses</h2>
      <dl class="addr-list">
        <div class="addr-row">
          <dt>Vault</dt>
          <dd>
            <a
              v-if="vault"
              :href="addressUrl(vault)"
              target="_blank"
              rel="noopener"
            >
              <Account :address="vault" />
            </a>
            <span
              v-else
              class="muted"
              >—</span
            >
            <Tag
              v-if="vault"
              small
              class="status-tag"
              :class="{ active: vaultDeployed }"
            >
              {{ vaultDeployed ? 'Deployed' : 'Not deployed' }}
            </Tag>
          </dd>
        </div>

        <div class="addr-row">
          <dt>Stash</dt>
          <dd>
            <a
              v-if="stash"
              :href="addressUrl(stash)"
              target="_blank"
              rel="noopener"
            >
              <Account :address="stash" />
            </a>
            <span
              v-else
              class="muted"
              >—</span
            >
            <Tag
              v-if="stash"
              small
              class="status-tag"
              :class="{ active: stashDeployed }"
            >
              {{ stashDeployed ? 'Deployed' : 'Not deployed' }}
            </Tag>
          </dd>
        </div>

        <div class="addr-row">
          <dt>User proxy</dt>
          <dd>
            <a
              v-if="userProxy"
              :href="addressUrl(userProxy)"
              target="_blank"
              rel="noopener"
            >
              <Account :address="userProxy" />
            </a>
            <span
              v-else
              class="muted"
              >Not registered</span
            >
            <Tag
              v-if="userProxy"
              small
              class="status-tag active"
            >
              Registered
            </Tag>
          </dd>
        </div>
      </dl>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { addressUrl } from '~/utils/explorer'

// Presentational only — addresses come from the page's `useAccountAddresses`
// so the same composable result feeds both this panel and `useAccountPunks`.
defineProps<{
  account: Address | undefined
  vault: Address | null
  stash: Address | null
  userProxy: Address | null
  vaultDeployed: boolean
  stashDeployed: boolean
}>()
</script>

<style scoped>
.profile-addresses {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.section-title {
  margin: 0;
}

.addr-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.addr-row {
  display: grid;
  grid-template-columns: minmax(7rem, max-content) minmax(0, 1fr);
  gap: var(--size-3);
  align-items: baseline;
  min-width: 0;
}

dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);
}

dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

a {
  border: 0;
}

.status-tag {
  flex: 0 0 auto;
  cursor: default;
}

@media (max-width: 520px) {
  .addr-row {
    grid-template-columns: 1fr;
  }
}
</style>
