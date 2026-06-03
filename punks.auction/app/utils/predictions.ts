import { fetchIndexer } from '~/utils/indexer'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

// The indexer caps the prediction id endpoints at 200 ids per request.
const MAX_BATCH_IDS = 200

function standardParam(standard: TokenStandardValue): 'v1' | 'v2' {
  return standard === TokenStandard.CryptoPunksV1 ? 'v1' : 'v2'
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// The market model's fair value (median predicted 24h-sale price, in wei) for
// each id of one standard, via the compact `/predictions/values` endpoint. Only
// ids the model prices appear in the result; unknown/zero-valued ids are absent.
// Rejects (via `fetchIndexer`) when the indexer is unreachable.
export async function fetchPunkValues(
  standard: TokenStandardValue,
  ids: readonly number[],
): Promise<Map<number, bigint>> {
  const out = new Map<number, bigint>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return out
  const param = standardParam(standard)
  for (const part of chunk(unique, MAX_BATCH_IDS)) {
    const { values } = await fetchIndexer<{ values: Record<string, string> }>(
      '/predictions/values',
      { standard: param, ids: part.join(',') },
    )
    for (const [id, wei] of Object.entries(values)) {
      out.set(Number(id), BigInt(wei))
    }
  }
  return out
}

// Fair value per lot item, aligned to `items` order; `null` where the model has
// no estimate. Used to size lot weights at create time.
export async function fetchLotFairValues(
  items: readonly { standard: TokenStandardValue; punkId: number }[],
): Promise<(bigint | null)[]> {
  const idsByStandard = new Map<TokenStandardValue, number[]>()
  for (const item of items) {
    const ids = idsByStandard.get(item.standard) ?? []
    ids.push(item.punkId)
    idsByStandard.set(item.standard, ids)
  }

  const valuesByStandard = new Map<TokenStandardValue, Map<number, bigint>>()
  for (const [standard, ids] of idsByStandard) {
    valuesByStandard.set(standard, await fetchPunkValues(standard, ids))
  }

  return items.map(
    (item) => valuesByStandard.get(item.standard)?.get(item.punkId) ?? null,
  )
}

export type PredictionDriver = {
  kind: string
  label?: string
  eth?: number
  ratioToFair?: number | null
  count?: number
  medianEth?: number
  rawMedianEth?: number
  marketAdjustedMedianEth?: number
  traitId?: number
  traitName?: string
  saleCount?: number
  multiplier?: number
  logPremium?: number
}

export type PredictionComp = {
  punkId: number
  eth: number
  marketAdjustedEth?: number
  wei: string
  timestamp: number
  source: string
  txHash?: string
  matchedTraitId?: number
}

export type PunkPrediction = {
  punkId: number
  standard: 'v1' | 'v2'
  quickSaleWei: bigint
  fairValueWei: bigint
  p10SaleWei: bigint
  p50SaleWei: bigint
  p90SaleWei: bigint
  saleProbability24h: number
  saleProbability7d: number | null
  saleProbability30d: number | null
  confidence: 'low' | 'medium' | 'high'
  drivers: PredictionDriver[]
  comps: PredictionComp[]
  traitPremiums: PredictionDriver[]
  generatedAt: string
}

type PunkPredictionWire = Omit<
  PunkPrediction,
  'quickSaleWei' | 'fairValueWei' | 'p10SaleWei' | 'p50SaleWei' | 'p90SaleWei'
> & {
  quickSaleWei: string
  fairValueWei: string
  p10SaleWei: string
  p50SaleWei: string
  p90SaleWei: string
}

// The full prediction for a single Punk, or `null` when the model has no
// estimate for it (404) or the indexer is unreachable — callers show nothing in
// that case rather than surfacing an error. Wei fields are parsed to bigint;
// `drivers`/`comps` pass through for the prediction detail modal.
export async function fetchPunkPrediction(
  punkId: number,
  standard: TokenStandardValue,
): Promise<PunkPrediction | null> {
  const param = standardParam(standard)
  try {
    const wire = await fetchIndexer<PunkPredictionWire>(
      `/predictions/${param}/${punkId}`,
    )
    return {
      ...wire,
      quickSaleWei: BigInt(wire.quickSaleWei),
      fairValueWei: BigInt(wire.fairValueWei),
      p10SaleWei: BigInt(wire.p10SaleWei),
      p50SaleWei: BigInt(wire.p50SaleWei),
      p90SaleWei: BigInt(wire.p90SaleWei),
    }
  } catch {
    return null
  }
}

// Driver magnitudes arrive as ETH floats; convert to wei for `EthAmount`, which
// only accepts integer wei. 4-decimal precision is ample for a driver label.
export function ethFloatToWei(eth: number): bigint {
  if (!Number.isFinite(eth)) return 0n
  return BigInt(Math.round(eth * 1e4)) * 10n ** 14n
}
