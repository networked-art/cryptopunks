<template>
  <dl class="stats-list">
    <div class="stat-row text-row">
      <dt>First seen</dt>
      <dd class="full">{{ firstSeenLabel }}</dd>
    </div>
    <div class="stat-row text-row">
      <dt>Last active</dt>
      <dd class="full">{{ lastActiveLabel }}</dd>
    </div>
    <div class="stat-row amount-row">
      <dt>
        <span>Bought</span>
        <span v-if="stats.salesBoughtCount > 0">
          ({{ stats.salesBoughtCount }}×)</span
        >
      </dt>
      <template v-if="stats.totalSpentWei > 0n">
        <dd class="usd">
          <template v-if="totalSpentUsd">${{ totalSpentUsd }}</template>
          <span
            v-else
            class="muted"
            >—</span
          >
        </dd>
        <dd class="eth">
          <EthAmount :wei="stats.totalSpentWei" />
        </dd>
      </template>
      <dd
        v-else
        class="full muted"
      >
        —
      </dd>
    </div>
    <div class="stat-row amount-row">
      <dt>
        <span>Sold</span>
        <span v-if="stats.salesSoldCount > 0">
          ({{ stats.salesSoldCount }}×)</span
        >
      </dt>
      <template v-if="stats.totalEarnedWei > 0n">
        <dd class="usd">
          <template v-if="totalEarnedUsd">${{ totalEarnedUsd }}</template>
          <span
            v-else
            class="muted"
            >—</span
          >
        </dd>
        <dd class="eth">
          <EthAmount :wei="stats.totalEarnedWei" />
        </dd>
      </template>
      <dd
        v-else
        class="full muted"
      >
        —
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { AccountStats } from '~/composables/useAccountStats'

const props = defineProps<{ stats: AccountStats }>()

const { ethUSDRaw, weiToUSD, fetchPrice } = usePriceFeed()
onMounted(() => {
  void fetchPrice()
})

const totalSpentUsd = computed(() =>
  ethUSDRaw.value && props.stats.totalSpentWei > 0n
    ? weiToUSD(props.stats.totalSpentWei)
    : null,
)

const totalEarnedUsd = computed(() =>
  ethUSDRaw.value && props.stats.totalEarnedWei > 0n
    ? weiToUSD(props.stats.totalEarnedWei)
    : null,
)

const lastActiveIso = computed(() =>
  props.stats.lastActiveAt
    ? new Date(props.stats.lastActiveAt * 1000).toISOString()
    : undefined,
)
const lastActiveAgo = useTimeAgo(lastActiveIso)
const lastActiveLabel = computed(() => lastActiveAgo.value || '—')

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const firstSeenLabel = computed(() => {
  if (!props.stats.firstSeenAt) return '—'
  return DATE_FORMAT.format(new Date(props.stats.firstSeenAt * 1000))
})
</script>

<style scoped>
.stats-list {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr auto auto;
  border: var(--border);
  background: var(--bg-elevated);
}

.stat-row {
  display: contents;
}

.stat-row > * {
  display: flex;
  align-items: center;
  padding: var(--size-2) 0;
  border-bottom: var(--border);
}

.stat-row > *:first-child {
  padding-left: var(--size-3);
}

.stat-row > *:last-child {
  padding-right: var(--size-3);
}

.stat-row > * + * {
  padding-left: var(--size-3);
}

.stat-row:last-child > * {
  border-bottom: 0;
}

dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);

  span {
    margin-right: var(--size-1);
  }
}

dd {
  margin: 0;
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  justify-content: flex-end;
}

.full {
  grid-column: 2 / 4;
}

.usd {
  grid-column: 2;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.eth {
  grid-column: 3;
}

.count {
  color: var(--text-muted);
}
</style>
