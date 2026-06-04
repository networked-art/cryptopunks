<template>
  <FormInputGroup
    role="group"
    aria-label="Price display"
  >
    <Button
      type="button"
      class="small"
      :class="{ primary: mode === 'eth' }"
      :aria-pressed="mode === 'eth'"
      @click="selectMode('eth')"
    >
      ETH
    </Button>
    <Button
      type="button"
      class="small"
      :class="{ primary: mode === 'usd' }"
      :aria-pressed="mode === 'usd'"
      @click="selectMode('usd')"
    >
      USD
    </Button>
  </FormInputGroup>
</template>

<script setup lang="ts">
import type { PriceDisplayMode } from '~/composables/usePriceDisplay'

const { mode, setMode } = usePriceDisplayMode()
const { fetchPriceOnce } = useEthUsdPriceFeed()

function selectMode(nextMode: PriceDisplayMode) {
  setMode(nextMode)
  if (nextMode === 'usd') void fetchPriceOnce()
}
</script>
