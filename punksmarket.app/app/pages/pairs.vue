<template>
  <div class="container pairs-page">
    <header class="page-head">
      <div class="page-head-titles">
        <h1>Pairs</h1>
        <p class="page-lead muted">
          Punks held by one wallet in both contracts.
        </p>
      </div>

      <form
        class="filter"
        @submit.prevent="applyFilter"
      >
        <FormInputGroup class="filter-group">
          <input
            v-model="ownerInput"
            type="search"
            class="filter-input"
            placeholder="Filter by address or ENS…"
            spellcheck="false"
          />
          <Button type="submit">Filter</Button>
        </FormInputGroup>
        <ClientOnly>
          <Button
            v-if="isConnected"
            type="button"
            @click="filterToConnected"
            >My pairs</Button
          >
        </ClientOnly>
        <Button
          v-if="activeOwner"
          type="button"
          @click="clearFilter"
          >Clear</Button
        >
      </form>
      <p
        v-if="filterError"
        class="filter-error error"
      >
        {{ filterError }}
      </p>
    </header>

    <ClientOnly>
      <div
        v-if="pending && !pairs.length"
        class="state muted"
      >
        Loading pairs…
      </div>
      <div
        v-else-if="error"
        class="state error"
      >
        Failed to load pairs: {{ error }}
      </div>
      <div
        v-else-if="!pairs.length"
        class="state empty muted"
      >
        {{
          activeOwner ? 'This wallet holds no paired punks.' : 'No pairs found.'
        }}
      </div>
      <template v-else>
        <p class="count muted">
          {{ total.toLocaleString() }} {{ total === 1 ? 'pair' : 'pairs' }}
          <template v-if="activeOwner"> · one wallet</template>
        </p>
        <div class="pair-grid">
          <PairCard
            v-for="pair in pairs"
            :key="pair.punkId"
            :punk-id="pair.punkId"
            :owner="pair.owner"
            :canonical="pair.canonical"
            :original="pair.original"
          />
        </div>
        <div
          v-if="hasMore"
          class="load-more"
        >
          <Button
            :disabled="pending"
            @click="loadMore"
          >
            {{ pending ? 'Loading…' : 'Load more' }}
          </Button>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { getPublicClient } from '@wagmi/core'
import { useConnection, useConfig } from '@wagmi/vue'
import { isAddress, type Address, type PublicClient } from 'viem'
import { normalize } from 'viem/ens'

useSeoMeta({
  title: 'Pairs · punksmarket.app',
  ogTitle: 'Pairs · punksmarket.app',
  twitterTitle: 'Pairs · punksmarket.app',
})

const config = useConfig()
const { address, isConnected } = useConnection()

const ownerInput = ref('')
const activeOwner = ref<Address | undefined>(undefined)
const filterError = ref<string | null>(null)

const { pairs, total, pending, error, hasMore, loadMore } = usePunkPairs(
  () => activeOwner.value,
)

async function applyFilter() {
  filterError.value = null
  const raw = ownerInput.value.trim()
  if (!raw) {
    activeOwner.value = undefined
    return
  }
  if (isAddress(raw)) {
    activeOwner.value = raw as Address
    return
  }
  if (!raw.includes('.')) {
    filterError.value = 'Enter a valid address or ENS name.'
    return
  }

  const client = getPublicClient(config, { chainId: 1 }) as
    | PublicClient
    | undefined
  if (!client) {
    filterError.value = 'ENS resolution is unavailable.'
    return
  }

  let name: string
  try {
    name = normalize(raw)
  } catch {
    filterError.value = 'Enter a valid address or ENS name.'
    return
  }

  const resolved = await client.getEnsAddress({ name })
  if (!resolved || !isAddress(resolved)) {
    filterError.value = `Could not resolve ${raw}.`
    return
  }
  activeOwner.value = resolved as Address
}

function filterToConnected() {
  if (!address.value) return
  ownerInput.value = address.value
  activeOwner.value = address.value
  filterError.value = null
}

function clearFilter() {
  ownerInput.value = ''
  activeOwner.value = undefined
  filterError.value = null
}
</script>

<style scoped>
.pairs-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.page-head-titles {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.page-head-titles h1 {
  margin: 0;
}

.page-lead {
  margin: 0;
  max-width: 64ch;
}

.filter {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.filter-group {
  flex: 1 1 320px;
  max-width: 480px;
}

.filter-input {
  width: 100%;
  background: transparent;
  border: 0;
  color: var(--text);
  font-size: 13px;
  padding: var(--size-2) var(--size-3);
}

.filter-input:focus {
  outline: none;
}

.filter-error {
  margin: 0;
  font-size: 12px;
}

.count {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pair-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--size-3);
}

.load-more {
  display: flex;
  justify-content: center;
  padding-top: var(--size-2);
}

.state {
  padding: var(--size-8);
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius);
}

.error {
  color: var(--accent);
}
</style>
