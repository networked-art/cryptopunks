import { splitPunksAuctionLotWeightsByValue } from '@networked-art/punks-sdk'
import type { TokenStandardValue } from '~/utils/auction'
import { fetchLotFairValues } from '~/utils/predictions'

export type LotWeightItem = { standard: TokenStandardValue; punkId: number }

// Auto-assigns each Punk's share of the eventual hammer price as basis points.
// The primary signal is the market model's fair value (indexer `/predictions`);
// when the indexer or model is unavailable — or any Punk in the lot is unpriced
// — it falls back to the SDK's offline trait-rarity ranking. Both paths return
// integer weights that are each >= 1 and sum to exactly the lot total, which is
// what `createLot` requires.
export function useLotWeights() {
  const { sdk } = usePunksSdk()

  async function resolveLotWeights(
    items: readonly LotWeightItem[],
  ): Promise<number[]> {
    if (items.length === 0) return []
    try {
      const values = await fetchLotFairValues(items)
      if (values.every((value) => value !== null && value > 0n)) {
        return splitPunksAuctionLotWeightsByValue(values as bigint[])
      }
    } catch {
      // Indexer/predictor unreachable — use the offline rarity estimate below.
    }
    return sdk.value.auctions.lotWeightsFromRarity(items.map((item) => item.punkId))
  }

  return { resolveLotWeights }
}
