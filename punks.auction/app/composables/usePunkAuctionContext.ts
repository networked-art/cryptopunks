import {
  auctionStatus,
  type LotItem,
  type TokenStandardValue,
} from '~/utils/auction'

/**
 * Every auction, lot, and offer on `PunksAuction` that involves a given Punk.
 * Auctions and lots match by exact item; offers match when the Punk satisfies
 * a slot's criteria (evaluated against the offline dataset).
 */
export function usePunkAuctionContext(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue>,
) {
  const { auctions, pending: auctionsPending } = useAuctions()
  const { lots, pending: lotsPending } = useLots()
  const { offers, pending: offersPending } = useOffers()
  const { matchesItem: offerSlotMatchesItem } = useOfferSlotMatching()
  const now = useSeconds()

  function matchesItem(item: LotItem): boolean {
    return (
      item.punkId === toValue(punkId) && item.standard === toValue(standard)
    )
  }

  const punkAuctions = computed(() =>
    auctions.value.filter(
      (auction) =>
        auctionStatus(auction, now.value) === 'live' &&
        auction.items.some(matchesItem),
    ),
  )

  const punkLots = computed(() =>
    lots.value.filter((l) => l.items.some(matchesItem)),
  )

  const punkOffers = computed(() =>
    offers.value.filter((offer) =>
      offer.slots.some((slot) => {
        return offerSlotMatchesItem(slot, {
          standard: toValue(standard),
          punkId: toValue(punkId),
        })
      }),
    ),
  )

  const pending = computed(
    () => auctionsPending.value || lotsPending.value || offersPending.value,
  )

  return { punkAuctions, punkLots, punkOffers, lots, pending }
}
