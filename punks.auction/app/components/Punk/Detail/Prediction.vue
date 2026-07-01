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
            <dt class="label">Modeled value</dt>
            <dd class="fair">
              <EthAmount
                :wei="prediction.fairValueWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
            </dd>
          </div>
          <div class="state-cell">
            <dt class="label">Likely range</dt>
            <dd>
              <EthAmount
                :wei="prediction.p10SaleWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
              <span class="dim">–</span>
              <EthAmount
                :wei="prediction.p90SaleWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
            </dd>
          </div>
        </dl>

        <div class="panel-actions">
          <span
            class="confidence-chip"
            :class="`conf-${prediction.confidence}`"
          >{{ confidenceLabel }}</span>
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
        <div class="dialog-intro">
          <PunkThumb
            class="intro-thumb"
            :punk-id="prediction.punkId"
            :standard="introStandard"
            :size="56"
            :link="false"
          />
          <p class="block-note muted">
            How the model values Punk #{{ prediction.punkId }}, the signals
            behind the estimate and the recent sales it compares against.
          </p>
        </div>

        <dl class="state-grid">
          <div class="state-cell">
            <dt class="label">Modeled value</dt>
            <dd>
              <EthAmount
                :wei="prediction.fairValueWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
            </dd>
          </div>
          <div class="state-cell">
            <dt class="label">Likely range</dt>
            <dd>
              <EthAmount
                :wei="prediction.p10SaleWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
              <span class="dim">–</span>
              <EthAmount
                :wei="prediction.p90SaleWei"
                :usd-round-to="PREDICTION_USD_ROUND_TO"
              />
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

        <p
          v-if="prediction.confidence !== 'high'"
          class="confidence-note muted"
        >
          Based on limited recent trading for this Punk — treat the estimate as a
          rough guide.
        </p>

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
          Estimates are model output, not advice. They can be wrong, especially
          for rarely traded Punks.
        </p>
      </Dialog>
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import { TokenStandard } from '~/utils/auction'
import { ethFloatToWei, type PredictionDriver } from '~/utils/predictions'

const { prediction } = usePunkPredictionContext()
const PREDICTION_USD_ROUND_TO = 1_000n

const confidenceLabel = computed(() => {
  const level = prediction.value?.confidence
  return level ? `${level[0]!.toUpperCase()}${level.slice(1)} confidence` : ''
})

const introStandard = computed(() =>
  prediction.value?.standard === 'v1'
    ? TokenStandard.CryptoPunksV1
    : TokenStandard.CryptoPunks,
)

const route = useRoute()
const router = useRouter()

// Mirror the details modal in the URL so an open estimate is linkable. The
// query is the source of truth on load; opening or closing writes it back.
const open = ref(route.query.estimate === 'open')

watch(open, (isOpen) => {
  if ((route.query.estimate === 'open') === isOpen) return
  const { estimate: _omit, ...rest } = route.query
  router.replace({ query: isOpen ? { ...rest, estimate: 'open' } : rest })
})

watch(
  () => route.query.estimate,
  (value) => {
    open.value = value === 'open'
  },
)

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
      // Own last sale reads as a floor-multiple + age; a raw ETH figure is
      // meaningless without the floor that stood at the time of that sale.
      if (driver.kind === 'own_sale') {
        return { label: driver.label!, valueText: formatOwnSale(driver) }
      }
      if (typeof driver.eth === 'number') {
        return { label: driver.label!, valueWei: ethFloatToWei(driver.eth) }
      }
      const medianEth =
        typeof driver.marketAdjustedMedianEth === 'number'
          ? driver.marketAdjustedMedianEth
          : driver.medianEth
      if (typeof medianEth === 'number') {
        return {
          label: driver.label!,
          valueWei: ethFloatToWei(medianEth),
        }
      }
      if (typeof driver.multiplier === 'number') {
        return {
          label: driver.label!,
          valueText: `${driver.multiplier.toFixed(2)}×`,
        }
      }
      return { label: driver.label! }
    }),
)

function formatAgo(timestamp: number): string {
  return formatAgeDays(Math.floor(Date.now() / 1000 - timestamp) / 86_400)
}

function formatAgeDays(days: number): string {
  const whole = Math.max(0, Math.floor(days))
  if (whole < 1) return 'today'
  if (whole < 30) return `${whole}d ago`
  const months = Math.floor(whole / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(whole / 365)}y ago`
}

// "Own last sale" as a floor-multiple + age, e.g. "~3.6× floor · 6y ago".
function formatOwnSale(driver: PredictionDriver): string {
  const parts: string[] = []
  const multiple = driver.floorMultiple
  if (typeof multiple === 'number' && Number.isFinite(multiple)) {
    parts.push(`~${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}× floor`)
  }
  if (typeof driver.ageDays === 'number' && Number.isFinite(driver.ageDays)) {
    parts.push(formatAgeDays(driver.ageDays))
  }
  return parts.join(' · ')
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
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding-top: var(--size-3);
  border-top: var(--border);
}

/* Confidence label on the card — muted when high, drawn out when the estimate
   leans on thin/old data so it reads as a caveat, not decoration. */
.confidence-chip {
  padding: var(--size-1) var(--size-2);
  border: var(--border);
  font-size: var(--font-xs);
  color: var(--text-dim);
  white-space: nowrap;
}

.conf-low,
.conf-medium {
  color: var(--text);
  border-color: var(--accent);
}

.confidence-note {
  margin: 0;
  font-size: var(--font-sm);
}

.block-note {
  margin: 0;
  font-size: var(--font-sm);
}

.dialog-intro {
  display: flex;
  align-items: center;
  gap: var(--size-3);
}

.intro-thumb {
  flex-shrink: 0;
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
  padding: var(--size-2);
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
