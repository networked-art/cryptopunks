import { fetchIndexer } from '~/utils/indexer'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

type PredictionBatchItem = { punkId: number; fairValueWei: string }
type PredictionBatchResponse = { items: PredictionBatchItem[] }

// The indexer caps `/predictions/batch` ids at 200; a lot tops out at 80, so one
// request per standard always suffices — chunk defensively all the same.
const MAX_BATCH_IDS = 200

function standardParam(standard: TokenStandardValue): 'v1' | 'v2' {
  return standard === TokenStandard.CryptoPunksV1 ? 'v1' : 'v2'
}

// The market model's fair value — the median predicted 24h-sale price, in wei —
// for each item, aligned to `items` order. An entry is `null` when the model has
// no prediction for that Punk. Rejects (via `fetchIndexer`) when the indexer is
// unreachable, so callers can fall back to an offline estimate.
export async function fetchLotFairValues(
  items: readonly { standard: TokenStandardValue; punkId: number }[],
): Promise<(bigint | null)[]> {
  const idsByStandard = new Map<'v1' | 'v2', number[]>()
  for (const item of items) {
    const standard = standardParam(item.standard)
    const ids = idsByStandard.get(standard) ?? []
    if (!ids.includes(item.punkId)) ids.push(item.punkId)
    idsByStandard.set(standard, ids)
  }

  const fairByKey = new Map<string, bigint>()
  for (const [standard, ids] of idsByStandard) {
    for (let offset = 0; offset < ids.length; offset += MAX_BATCH_IDS) {
      const chunk = ids.slice(offset, offset + MAX_BATCH_IDS)
      const { items: predictions } = await fetchIndexer<PredictionBatchResponse>(
        '/predictions/batch',
        { standard, ids: chunk.join(',') },
      )
      for (const prediction of predictions) {
        fairByKey.set(
          `${standard}-${prediction.punkId}`,
          BigInt(prediction.fairValueWei),
        )
      }
    }
  }

  return items.map(
    (item) =>
      fairByKey.get(`${standardParam(item.standard)}-${item.punkId}`) ?? null,
  )
}
