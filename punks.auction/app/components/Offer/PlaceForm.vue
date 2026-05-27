<template>
  <OfferPlaceFlow @placed="emit('placed', $event)" />
</template>

<script setup lang="ts">
import type { Hash } from 'viem'

type PlaceOfferResult = {
  tx: Hash
  offerId: bigint | null
}

const emit = defineEmits<{
  placed: [result: PlaceOfferResult]
}>()
</script>
