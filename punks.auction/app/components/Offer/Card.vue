<template>
  <OfferItemShell
    :to="detailHref"
    :aria-label="`View offer ${offer.id}`"
  >
    <OfferTarget :target="target" />
    <OfferCardAmount
      :wei="offer.amountWei"
      :offerer="offer.offerer"
      :show-offerer="showOfferer"
    />
  </OfferItemShell>
</template>

<script setup lang="ts">
import { offerRecordTarget } from '~/composables/useOfferTarget'
import type { OfferRecord } from '~/utils/auction'

defineOptions({ name: 'OfferCard' })

const props = defineProps<{
  offer: OfferRecord
  displayedOffererAddresses?: readonly string[]
}>()

const offline = usePunksOffline()
const detailHref = computed(() => `/purchase-offers/${props.offer.id}`)
const target = computed(() => offerRecordTarget(props.offer, offline))

const showOfferer = computed(() => {
  const offerer = props.offer.offerer.toLowerCase()
  return !props.displayedOffererAddresses?.some(
    (address) => address.toLowerCase() === offerer,
  )
})
</script>
