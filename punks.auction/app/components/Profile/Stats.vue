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
    <div
      v-if="stats.punksClaimedCount > 0"
      class="stat-row"
    >
      <dt>Claimed</dt>
      <dd>{{ stats.punksClaimedCount }} {{ punksWord }}</dd>
    </div>
    <div class="stat-row">
      <dt>
        <span>Bought</span>
        <span v-if="stats.salesBoughtCount > 0">
          ({{ stats.salesBoughtCount }}×)</span
        >
      </dt>
      <template v-if="stats.totalSpentWei > 0n">
        <dd>
          <EthAmount
            :wei="stats.totalSpentWei"
            historical
            :historical-usd-cents="
              stats.totalSpentUsdCents > 0n ? stats.totalSpentUsdCents : null
            "
          />
        </dd>
      </template>
      <dd
        v-else
        class="muted"
      >
        —
      </dd>
    </div>
    <div class="stat-row">
      <dt>
        <span>Sold</span>
        <span v-if="stats.salesSoldCount > 0">
          ({{ stats.salesSoldCount }}×)</span
        >
      </dt>
      <template v-if="stats.totalEarnedWei > 0n">
        <dd>
          <EthAmount
            :wei="stats.totalEarnedWei"
            historical
            :historical-usd-cents="
              stats.totalEarnedUsdCents > 0n ? stats.totalEarnedUsdCents : null
            "
          />
        </dd>
      </template>
      <dd
        v-else
        class="muted"
      >
        —
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { AccountStats } from '~/composables/useAccountStats'

const props = defineProps<{ stats: AccountStats }>()

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

const punksWord = computed(() =>
  props.stats.punksClaimedCount === 1 ? 'punk' : 'punks',
)
</script>

<style scoped>
.stats-list {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  border: var(--border);
  background: var(--white);
}

.stat-row {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  min-width: 0;
  padding: var(--size-2) var(--size-3);
  border-bottom: var(--border);
}

.stat-row:last-child {
  border-bottom: 0;
}

dt {
  flex: 1;
  min-width: 0;
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
  text-align: right;
}

/* Desktop: 2-col when there are only 4 rows (no Claimed). With Claimed
   present (5 rows), an awkward dangling cell would appear in 2-col, so the
   layout stays single-column. :has() lets the grid react automatically.
   Column-major flow puts the two date rows in the left column and the two
   amount rows in the right column. */
@media (min-width: 720px) {
  .stats-list:not(:has(> :nth-child(5))) {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    grid-auto-flow: column;
  }

  .stats-list:not(:has(> :nth-child(5))) > .stat-row:nth-child(-n + 2) {
    border-right: var(--border);
  }

  .stats-list:not(:has(> :nth-child(5))) > .stat-row:nth-child(even) {
    border-bottom: 0;
  }
}
</style>
