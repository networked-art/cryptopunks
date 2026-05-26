<template>
  <OfferPlaceFlow @placed="emit('placed', $event)" />
</template>

<script setup lang="ts">
import type { Hash } from 'viem'

const emit = defineEmits<{
  placed: [tx: Hash]
}>()
</script>
