import type { Address } from 'viem'

export function usePunkListing(punkId: MaybeRefOrGetter<number>) {
  const { sdk } = usePunksSdk()
  const data = ref<{
    isForSale: boolean
    seller: Address
    priceWei: bigint
    onlySellTo: Address
  } | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = toValue(punkId)
    pending.value = true
    error.value = null
    try {
      const listing = await sdk.value.market.listing(id)
      data.value = {
        isForSale: listing.isForSale,
        seller: listing.seller,
        priceWei: listing.priceWei,
        onlySellTo: listing.onlySellTo,
      }
    } catch (e) {
      error.value = (e as Error).message
      data.value = null
    } finally {
      pending.value = false
    }
  }

  async function loadBid() {
    return sdk.value.market.bidFor(toValue(punkId))
  }

  watch(() => toValue(punkId), load, { immediate: true })

  return { data, pending, error, refresh: load, loadBid }
}
