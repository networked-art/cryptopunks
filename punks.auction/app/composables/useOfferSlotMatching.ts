import {
  offerSlotCriteriaToQuery,
  offerSlotMatchesPunk,
  type LotItem,
  type OfferSlot,
} from '~/utils/auction'

export function useOfferSlotMatching() {
  const offline = usePunksOffline()

  function searchCriteriaMatches(slot: OfferSlot) {
    try {
      return offline.search(offerSlotCriteriaToQuery(slot))
    } catch {
      return []
    }
  }

  function criteriaMatchesPunk(slot: OfferSlot, punkId: number) {
    return searchCriteriaMatches(slot).includes(punkId)
  }

  function matchesItem(
    slot: OfferSlot,
    item: Pick<LotItem, 'standard' | 'punkId'>,
  ) {
    return offerSlotMatchesPunk(slot, item, criteriaMatchesPunk)
  }

  return {
    criteriaMatchesPunk,
    matchesItem,
    searchCriteriaMatches,
  }
}
