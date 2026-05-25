<template>
  <ClientOnly>
    <ul class="status-pills">
      <li
        v-for="pill in pills"
        :key="pill.key"
      >
        <Tooltip side="bottom">
          <template #trigger>
            <Tag
              small
              class="pill"
              :class="{ active: pill.active }"
            >
              <Icon
                v-if="pill.active"
                name="lucide:check"
                class="pill-icon check"
                aria-hidden="true"
              />
              <span
                v-else
                class="dot"
                aria-hidden="true"
              />
              <span>
                {{ pill.label }}
              </span>
            </Tag>
          </template>

          <div class="tooltip-body">
            <strong>{{ pill.title }}</strong>
            <p class="status">{{ pill.statusLabel }}</p>
            <a
              v-if="pill.address"
              :href="addressUrl(pill.address)"
              target="_blank"
              rel="noopener"
              class="explorer"
            >
              <Account :address="pill.address" />
              <Icon name="lucide:external-link" />
            </a>
            <p class="hint muted">{{ pill.hint }}</p>
          </div>
        </Tooltip>
      </li>
    </ul>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { Address } from 'viem'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{
  vault: Address | null
  stash: Address | null
  wrapperProxy: Address | null
  vaultDeployed: boolean
  stashDeployed: boolean
}>()

type Pill = {
  key: string
  label: string
  title: string
  active: boolean
  statusLabel: string
  address: Address | null
  hint: string
}

const pills = computed<Pill[]>(() => [
  {
    key: 'vault',
    label: 'Vault',
    title: 'PunksVault',
    active: props.vaultDeployed,
    statusLabel: props.vaultDeployed ? 'Deployed' : 'Not deployed',
    address: props.vault,
    hint: props.vaultDeployed
      ? 'Auction-aware custody for your punks.'
      : 'Predicted address. Deploys on first interaction.',
  },
  {
    key: 'stash',
    label: 'Stash',
    title: 'Stash',
    active: props.stashDeployed,
    statusLabel: props.stashDeployed ? 'Deployed' : 'Not deployed',
    address: props.stash,
    hint: props.stashDeployed
      ? 'Yuga Labs stash for batch transfers and bids.'
      : 'Predicted address. Deploys via StashFactory.',
  },
  {
    key: 'wrapper-proxy',
    label: 'Wrapper',
    title: 'Wrapper proxy',
    active: !!props.wrapperProxy,
    statusLabel: props.wrapperProxy ? 'Registered' : 'Not registered',
    address: props.wrapperProxy,
    hint: props.wrapperProxy
      ? 'Holds C̝ͫ̔̏̑r̬̋͂ͯ̇y̷̹͎͊͌͊p͇̪͓͓̀͜͝t̜̀ͭͮ̒̍oPủ̯̹͈n͎͌kş̮͍̓ͭ̍̈́ during legacy wrap and unwrap.'
      : 'Registered on demand via WrappedPunks.registerProxy().',
  },
])
</script>

<style scoped>
.status-pills {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
}

.pill {
  cursor: default;
}

.pill :deep(> span) {
  gap: var(--size-2);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-dim);
  flex: 0 0 auto;
}

.pill-icon.check {
  flex: 0 0 auto;
}

.tooltip-body {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 12rem;
  max-width: 20rem;
}

.tooltip-body strong {
  font-size: var(--font-sm);
}

.status {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-dim);
}

.explorer {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  font-size: var(--font-xs);
  border: 0;
  word-break: break-all;
}

.hint {
  margin: 0;
  font-size: var(--font-xs);
}
</style>
