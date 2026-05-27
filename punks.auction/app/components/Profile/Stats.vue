<template>
  <dl class="stats-list">
    <div class="stat-row">
      <dt>First seen</dt>
      <dd>{{ firstSeenLabel }}</dd>
    </div>
    <div class="stat-row">
      <dt>Last active</dt>
      <dd>{{ lastActiveLabel }}</dd>
    </div>
    <div class="stat-row">
      <dt>
        Bought<span
          v-if="stats.salesBoughtCount > 0"
          class="count"
        >
          ({{ stats.salesBoughtCount }}×)</span
        >
      </dt>
      <dd>
        <template v-if="stats.totalSpentWei > 0n">
          <EthAmount :wei="stats.totalSpentWei" />
          <span
            v-if="totalSpentUsd"
            class="usd"
            >{{ totalSpentUsd }}</span
          >
        </template>
        <span
          v-else
          class="muted"
          >—</span
        >
      </dd>
    </div>
    <div class="stat-row">
      <dt>
        Sold<span
          v-if="stats.salesSoldCount > 0"
          class="count"
        >
          ({{ stats.salesSoldCount }}×)</span
        >
      </dt>
      <dd>
        <template v-if="stats.totalEarnedWei > 0n">
          <EthAmount :wei="stats.totalEarnedWei" />
          <span
            v-if="totalEarnedUsd"
            class="usd"
            >{{ totalEarnedUsd }}</span
          >
        </template>
        <span
          v-else
          class="muted"
          >—</span
        >
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

const firstSeenLabel = computed(() => {
  if (!props.stats.firstSeenAt) return '—'
  return new Date(props.stats.firstSeenAt * 1000).toISOString().slice(0, 10)
})
</script>

<style scoped>
.stats-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  border: var(--border);
  background: var(--bg-elevated);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  border-bottom: var(--border);
}

.stat-row:last-child {
  border-bottom: 0;
}

.stat-row dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);
}

.stat-row dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: baseline;
  gap: var(--size-2);
}

.count {
  color: var(--text-muted);
}

.usd {
  color: var(--text-dim);
  font-size: var(--font-xs);
}
</style>
