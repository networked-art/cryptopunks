<template>
  <ClientOnly>
    <section
      v-if="prediction"
      class="block prediction-block"
    >
      <h2 class="block-title eyebrow">Value Estimate</h2>

      <div class="prediction-panel">
        <dl class="state-grid">
          <div class="state-cell">
            <dt class="label">Fair value</dt>
            <dd class="fair"><EthAmount :wei="prediction.fairValueWei" /></dd>
          </div>
          <div class="state-cell">
            <dt class="label">Likely range</dt>
            <dd>
              <EthAmount :wei="prediction.p10SaleWei" />
              <span class="dim">–</span>
              <EthAmount :wei="prediction.p90SaleWei" />
            </dd>
          </div>
        </dl>

        <div class="panel-actions">
          <Button
            class="secondary"
            @click="open = true"
          >
            Details
          </Button>
        </div>
      </div>

      <Dialog
        v-model:open="open"
        title="Prediction details"
        class="prediction-dialog"
        compat
      >
        <p class="block-note muted">
          How the model values Punk #{{ prediction.punkId }} — the signals behind
          the estimate and the recent sales it compares against.
        </p>

        <dl class="state-grid">
          <div class="state-cell">
            <dt class="label">Fair value</dt>
            <dd><EthAmount :wei="prediction.fairValueWei" /></dd>
          </div>
          <div class="state-cell">
            <dt class="label">Likely range</dt>
            <dd>
              <EthAmount :wei="prediction.p10SaleWei" />
              <span class="dim">–</span>
              <EthAmount :wei="prediction.p90SaleWei" />
            </dd>
          </div>
          <div class="state-cell">
            <dt class="label">Sale chance · 24h</dt>
            <dd>{{ formatPct(prediction.saleProbability24h) }}</dd>
          </div>
          <div class="state-cell">
            <dt class="label">Confidence</dt>
            <dd class="confidence">{{ prediction.confidence }}</dd>
          </div>
        </dl>

        <div
          v-if="driverRows.length"
          class="detail-section"
        >
          <h3 class="detail-title eyebrow">Signals</h3>
          <dl class="drivers">
            <div
              v-for="(driver, index) in driverRows"
              :key="index"
              class="driver-row"
            >
              <dt class="driver-label">{{ driver.label }}</dt>
              <dd class="driver-value">
                <EthAmount
                  v-if="driver.valueWei !== undefined"
                  :wei="driver.valueWei"
                />
                <span v-else-if="driver.valueText">{{ driver.valueText }}</span>
              </dd>
            </div>
          </dl>
        </div>

        <div
          v-if="prediction.comps.length"
          class="detail-section"
        >
          <h3 class="detail-title eyebrow">Comparable sales</h3>
          <ul class="comps">
            <li
              v-for="comp in prediction.comps"
              :key="`${comp.punkId}-${comp.timestamp}`"
              class="comp-row"
            >
              <NuxtLink
                class="comp-link"
                :to="`/punks/${comp.punkId}`"
              >
                <PunkThumb
                  :punk-id="comp.punkId"
                  :size="36"
                  :link="false"
                />
                <span class="comp-id label">#{{ comp.punkId }}</span>
              </NuxtLink>
              <span class="comp-price">
                <EthAmount :wei="comp.wei" />
              </span>
              <span class="comp-when dim">{{ formatAgo(comp.timestamp) }}</span>
            </li>
          </ul>
        </div>

        <p class="model-note muted">
          Estimates are model output, not advice — they can be wrong, especially
          for rarely traded Punks.
        </p>
      </Dialog>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ethFloatToWei } from '~/utils/predictions'

const { prediction } = usePunkPredictionContext()

const open = ref(false)

function formatPct(probability: number): string {
  return `${Math.round(probability * 100)}%`
}

// One row per non-redundant driver: an ETH magnitude where the signal carries
// one, a multiplier for trait premiums, else just the label. The 24h sale
// probability driver is dropped — the modal already lists it as a stat.
const driverRows = computed(() =>
  (prediction.value?.drivers ?? [])
    .filter((driver) => driver.kind !== 'sale_probability' && driver.label)
    .map((driver) => {
      if (typeof driver.eth === 'number') {
        return { label: driver.label!, valueWei: ethFloatToWei(driver.eth) }
      }
      if (typeof driver.medianEth === 'number') {
        return { label: driver.label!, valueWei: ethFloatToWei(driver.medianEth) }
      }
      if (typeof driver.multiplier === 'number') {
        return { label: driver.label!, valueText: `${driver.multiplier.toFixed(2)}×` }
      }
      return { label: driver.label! }
    }),
)

function formatAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp)
  const days = Math.floor(seconds / 86_400)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.prediction-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.panel-actions {
  display: flex;
  padding-top: var(--size-3);
  border-top: var(--border);
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

/* Stat grid — shared by the card (Fair value + range) and the modal. */
.state-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
}

.state-cell {
  min-width: 0;
}

.state-cell dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

.state-cell dd.fair {
  font-size: var(--font-md);
}

.confidence {
  text-transform: capitalize;
}

.label {
  margin-bottom: var(--size-1);
  color: var(--text-dim);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.detail-title {
  margin: 0;
}

.drivers {
  margin: 0;
  display: flex;
  flex-direction: column;
  border: var(--border);
  border-bottom: 0;
}

.driver-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  border-bottom: var(--border);
  font-size: var(--font-sm);
}

.driver-label {
  min-width: 0;
  color: var(--text-muted);
}

.driver-value {
  margin: 0;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.comps {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--border);
  border-bottom: 0;
}

.comp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  align-items: center;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  border-bottom: var(--border);
  font-size: var(--font-sm);
}

.comp-link {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  min-width: 0;
  border: 0;
}

.comp-link :deep(.punk-thumb) {
  border-radius: 0;
}

.comp-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comp-price {
  font-variant-numeric: tabular-nums;
}

.comp-when {
  font-size: var(--font-xs);
}

.model-note {
  margin: 0;
  font-size: var(--font-xs);
}

@media (max-width: 540px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
