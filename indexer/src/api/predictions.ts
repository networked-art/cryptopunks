import { Hono } from 'hono'
import type { Context } from 'hono'
import { OfflinePunksDataClient } from '@networked-art/punks-sdk/offline'
import {
  TraitKind,
  headVariantNames,
  skinToneHeadVariants,
  skinToneNames,
} from '@networked-art/punks-sdk'
import { sql } from 'ponder'
import { db } from 'ponder:api'
import { listing, punk, punkTrait } from 'ponder:schema'

const PUNK_COUNT = 10000
const MAX_BATCH_IDS = 200
const MAX_OPPORTUNITIES = 200
const DEFAULT_OPPORTUNITIES = 50
const offlinePunks = new OfflinePunksDataClient()
const TRAIT_COUNT = offlinePunks.getTraitCountSync()

type Standard = 'v1' | 'v2'
type Row = Record<string, unknown>

const app = new Hono()

app.get('/model', async (c) => {
  const rows = normalizeRows(
    await db.execute(sql`
      SELECT
        r.run_id,
        r.model_version,
        r.status,
        r.active,
        r.trained_at,
        r.data_cutoff,
        r.training_started_at,
        r.training_finished_at,
        r.metrics_json,
        r.config_json,
        r.created_at,
        c.generated_at AS market_context_generated_at
      FROM offchain.prediction_model_runs r
      LEFT JOIN offchain.prediction_market_context c ON c.run_id = r.run_id
      WHERE r.active = true
      ORDER BY r.trained_at DESC
      LIMIT 1
    `),
  )
  const row = rows[0]
  if (!row) return c.json({ error: 'no_active_model' }, 404)
  return c.json(serializeModel(row))
})

app.get('/market', async (c) => {
  const rows = normalizeRows(
    await db.execute(sql`
      SELECT
        c.run_id,
        c.v2_floor_wei::text AS v2_floor_wei,
        c.v1_floor_wei::text AS v1_floor_wei,
        c.v2_bid_floor_wei::text AS v2_bid_floor_wei,
        c.v1_bid_floor_wei::text AS v1_bid_floor_wei,
        c.v2_listed_count,
        c.v1_listed_count,
        c.v2_active_bid_count,
        c.v1_active_bid_count,
        c.recent_v2_sales_count,
        c.recent_v1_sales_count,
        c.v1_v2_multiplier::text AS v1_v2_multiplier,
        c.context_json,
        c.generated_at,
        r.model_version,
        r.trained_at,
        r.data_cutoff
      FROM offchain.prediction_market_context c
      JOIN offchain.prediction_model_runs r ON r.run_id = c.run_id
      WHERE r.active = true
      ORDER BY r.trained_at DESC
      LIMIT 1
    `),
  )
  const row = rows[0]
  if (!row) return c.json({ error: 'no_active_market_context' }, 404)
  return c.json(serializeMarketContext(row))
})

app.get('/batch', async (c) => {
  const standard = parseStandard(c.req.query('standard') ?? 'v2')
  if (!standard) return c.json({ error: 'invalid_standard' }, 400)

  const ids = parseIds(c.req.query('ids'))
  if (!ids) {
    return c.json(
      { error: 'invalid_ids', max: MAX_BATCH_IDS, punkCount: PUNK_COUNT },
      400,
    )
  }
  if (ids.length === 0) return c.json({ items: [] })

  // ids are validated integers in [0, 9999], so the raw list is safe.
  const idsSql = sql.raw(ids.join(', '))
  const rows = normalizeRows(
    await db.execute(sql`
      WITH active_run AS (
        SELECT *
        FROM offchain.prediction_model_runs
        WHERE active = true
        ORDER BY trained_at DESC
        LIMIT 1
      )
      SELECT ${predictionSelectSql()}
      FROM offchain.punk_predictions p
      JOIN active_run r ON r.run_id = p.run_id
      LEFT JOIN offchain.prediction_market_context c ON c.run_id = r.run_id
      WHERE p.standard = ${standard}
        AND p.punk_id IN (${idsSql})
      ORDER BY array_position(ARRAY[${idsSql}]::int[], p.punk_id)
    `),
  )

  return c.json({ items: rows.map(serializePrediction) })
})

// Minimal companion to /batch: just the fair value (wei) per requested id, as a
// compact `{ values: { "<id>": "<wei>" } }` map. Built for viewport-driven grid
// estimates where the full prediction payload (drivers/comps/bands) would be
// wasteful. Omits ids with no prediction or a non-positive fair value.
app.get('/values', async (c) => {
  const standard = parseStandard(c.req.query('standard') ?? 'v2')
  if (!standard) return c.json({ error: 'invalid_standard' }, 400)

  const ids = parseIds(c.req.query('ids'))
  if (!ids) {
    return c.json(
      { error: 'invalid_ids', max: MAX_BATCH_IDS, punkCount: PUNK_COUNT },
      400,
    )
  }
  if (ids.length === 0) return c.json({ values: {} })

  // ids are validated integers in [0, 9999], so the raw list is safe.
  const idsSql = sql.raw(ids.join(', '))
  const rows = normalizeRows(
    await db.execute(sql`
      WITH active_run AS (
        SELECT run_id
        FROM offchain.prediction_model_runs
        WHERE active = true
        ORDER BY trained_at DESC
        LIMIT 1
      )
      SELECT p.punk_id, p.fair_value_wei::text AS fair_value_wei
      FROM offchain.punk_predictions p
      JOIN active_run r ON r.run_id = p.run_id
      WHERE p.standard = ${standard}
        AND p.punk_id IN (${idsSql})
        AND p.fair_value_wei > 0
    `),
  )

  const values: Record<string, string> = {}
  for (const row of rows) {
    values[String(toInt(row.punk_id))] = bigStr(row.fair_value_wei)
  }
  return c.json({ values })
})

// Underpriced public V2 listings: active asks below the model's fair value,
// i.e. model-flagged "deals". Surfaces the gap between live ask and the
// predicted fair value. `?sort=discount` (default) ranks by largest absolute
// ETH discount; `?sort=liquidity` weights it by sale probability.
app.get('/opportunities', async (c) => {
  const limit = clampInt(
    c.req.query('limit'),
    DEFAULT_OPPORTUNITIES,
    1,
    MAX_OPPORTUNITIES,
  )
  const minDiscount = clampFloat(c.req.query('minDiscountPct'), 0, 0, 0.99)
  // `discount` (default) ranks by raw ETH below fair; `liquidity` weights that
  // edge by the Punk's sale probability, so the top-N reflects deals you can
  // actually flip instead of paper discounts on Punks that rarely trade.
  const sort = c.req.query('sort') === 'liquidity' ? 'liquidity' : 'discount'
  const edge = sql`(p.fair_value_wei::numeric - l.min_value_wei::numeric)`
  const orderBy =
    sort === 'liquidity'
      ? sql`${edge} * COALESCE(p.sale_probability_24h::numeric, 0) DESC`
      : sql`${edge} DESC`
  const rows = normalizeRows(
    await db.execute(sql`
      WITH active_run AS (
        SELECT run_id, trained_at
        FROM offchain.prediction_model_runs
        WHERE active = true
        ORDER BY trained_at DESC
        LIMIT 1
      )
      SELECT
        l.punk_id,
        l.min_value_wei::text AS ask_wei,
        p.fair_value_wei::text AS fair_value_wei,
        p.p10_sale_wei::text AS p10_sale_wei,
        p.p90_sale_wei::text AS p90_sale_wei,
        p.sale_probability_24h::text AS sale_probability_24h,
        p.drivers_json,
        p.confidence,
        (1 - (l.min_value_wei::numeric / p.fair_value_wei::numeric)) AS discount,
        r.trained_at
      FROM ${listing} l
      JOIN ${punk} pk ON pk.punk_id = l.punk_id
      JOIN active_run r ON true
      JOIN offchain.punk_predictions p
        ON p.run_id = r.run_id AND p.standard = 'v2' AND p.punk_id = l.punk_id
      WHERE l.active = true
        AND l.only_sell_to IS NULL
        AND pk.native_owner IS NOT NULL
        AND l.seller = pk.native_owner
        AND p.fair_value_wei > 0
        AND l.min_value_wei::numeric < p.fair_value_wei::numeric * (1 - ${minDiscount}::float8)
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `),
  )
  return c.json({ items: rows.map(serializeOpportunity) })
})

// Per-trait predicted value: the model's predicted floor (min fair value) and
// median across Punks bearing each trait, plus the current public listed floor
// for that trait. Lets consumers show "Alien floor", "Ape floor", etc.
app.get('/trait-floors', async (c) => {
  const rows = normalizeRows(
    await db.execute(sql`
      WITH active_run AS (
        SELECT run_id
        FROM offchain.prediction_model_runs
        WHERE active = true
        ORDER BY trained_at DESC
        LIMIT 1
      ),
      listed AS (
        SELECT pt.trait_id, MIN(l.min_value_wei) AS listed_floor_wei
        FROM ${listing} l
        JOIN ${punk} pk ON pk.punk_id = l.punk_id
        JOIN ${punkTrait} pt ON pt.punk_id = l.punk_id
        WHERE l.active = true
          AND l.only_sell_to IS NULL
          AND pk.native_owner IS NOT NULL
          AND l.seller = pk.native_owner
        GROUP BY pt.trait_id
      )
      SELECT
        pt.trait_id,
        COUNT(*)::int AS supply,
        MIN(p.fair_value_wei::numeric)::text AS predicted_floor_wei,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY p.fair_value_wei::numeric))::numeric(78,0)::text AS predicted_median_wei,
        lf.listed_floor_wei::text AS listed_floor_wei
      FROM ${punkTrait} pt
      JOIN active_run r ON true
      JOIN offchain.punk_predictions p
        ON p.run_id = r.run_id AND p.standard = 'v2' AND p.punk_id = pt.punk_id
      LEFT JOIN listed lf ON lf.trait_id = pt.trait_id
      GROUP BY pt.trait_id, lf.listed_floor_wei
      ORDER BY MIN(p.fair_value_wei::numeric) DESC
    `),
  )
  return c.json({
    items: rows.map(serializeTraitFloor).filter((r) => r !== null),
  })
})

app.get('/v1/:punkId{[0-9]+}', async (c) =>
  predictionResponse(c, 'v1', c.req.param('punkId')),
)

app.get('/v2/:punkId{[0-9]+}', async (c) =>
  predictionResponse(c, 'v2', c.req.param('punkId')),
)

async function predictionResponse(
  c: Context,
  standard: Standard,
  punkIdParam: string,
) {
  const punkId = parsePunkId(punkIdParam)
  if (punkId === null) return c.json({ error: 'invalid_punk_id' }, 400)

  const rows = normalizeRows(
    await db.execute(sql`
      WITH active_run AS (
        SELECT *
        FROM offchain.prediction_model_runs
        WHERE active = true
        ORDER BY trained_at DESC
        LIMIT 1
      )
      SELECT ${predictionSelectSql()}
      FROM offchain.punk_predictions p
      JOIN active_run r ON r.run_id = p.run_id
      LEFT JOIN offchain.prediction_market_context c ON c.run_id = r.run_id
      WHERE p.standard = ${standard}
        AND p.punk_id = ${punkId}
      LIMIT 1
    `),
  )
  const row = rows[0]
  if (!row) {
    return c.json({ error: 'prediction_not_found', standard, punkId }, 404)
  }
  return c.json(serializePrediction(row))
}

function predictionSelectSql() {
  return sql`
    p.run_id,
    p.standard,
    p.punk_id,
    p.quick_sale_wei::text AS quick_sale_wei,
    p.fair_value_wei::text AS fair_value_wei,
    p.p10_sale_wei::text AS p10_sale_wei,
    p.p50_sale_wei::text AS p50_sale_wei,
    p.p90_sale_wei::text AS p90_sale_wei,
    p.sale_probability_24h::text AS sale_probability_24h,
    p.confidence,
    p.drivers_json,
    p.comps_json,
    p.trait_premiums_json,
    p.market_context_json,
    p.created_at AS prediction_created_at,
    r.model_version,
    r.trained_at,
    r.data_cutoff,
    r.metrics_json AS model_metrics_json,
    c.generated_at AS market_context_generated_at
  `
}

function serializePrediction(row: Row) {
  return {
    punkId: toInt(row.punk_id),
    standard: String(row.standard) as Standard,
    target: '24h_sale',
    quickSaleWei: bigStr(row.quick_sale_wei),
    fairValueWei: bigStr(row.fair_value_wei),
    p10SaleWei: bigStr(row.p10_sale_wei),
    p50SaleWei: bigStr(row.p50_sale_wei),
    p90SaleWei: bigStr(row.p90_sale_wei),
    saleProbability24h: toFloat(row.sale_probability_24h),
    saleProbability7d: horizonProbability(row.drivers_json, 'day7'),
    saleProbability30d: horizonProbability(row.drivers_json, 'day30'),
    confidence: String(row.confidence),
    drivers: withTraitPremiumLabels(jsonArray(row.drivers_json)),
    comps: jsonArray(row.comps_json),
    traitPremiums: withTraitPremiumLabels(jsonArray(row.trait_premiums_json)),
    marketContext: jsonObject(row.market_context_json),
    model: {
      runId: String(row.run_id),
      version: String(row.model_version),
      trainedAt: isoString(row.trained_at),
      dataCutoff: isoString(row.data_cutoff),
      metrics: jsonObject(row.model_metrics_json),
    },
    generatedAt: isoString(row.prediction_created_at),
    marketContextGeneratedAt: nullableIsoString(
      row.market_context_generated_at,
    ),
  }
}

function serializeOpportunity(row: Row) {
  return {
    punkId: toInt(row.punk_id),
    standard: 'v2' as Standard,
    askWei: bigStr(row.ask_wei),
    fairValueWei: bigStr(row.fair_value_wei),
    p10SaleWei: bigStr(row.p10_sale_wei),
    p90SaleWei: bigStr(row.p90_sale_wei),
    discount: toFloat(row.discount),
    saleProbability24h: toFloat(row.sale_probability_24h),
    saleProbability7d: horizonProbability(row.drivers_json, 'day7'),
    saleProbability30d: horizonProbability(row.drivers_json, 'day30'),
    confidence: String(row.confidence),
    modelTrainedAt: isoString(row.trained_at),
  }
}

// Returns null for traits dropped from display (non-human head variants, which
// duplicate the Type floor). Female/Male head-variant floors are distinct
// cohorts that share a skin-tone label (e.g. two "Dark skin" rows) —
// disambiguate by `traitId` if a consumer needs the gender split.
function serializeTraitFloor(row: Row) {
  const traitId = toInt(row.trait_id)
  const traitName = displayTraitName(traitId)
  if (traitName === null) return null
  return {
    traitId,
    traitName,
    supply: toInt(row.supply),
    predictedFloorWei: bigStr(row.predicted_floor_wei),
    predictedMedianWei: bigStr(row.predicted_median_wei),
    listedFloorWei: nullableBigStr(row.listed_floor_wei),
  }
}

function horizonProbability(driversJson: unknown, key: string): number | null {
  for (const d of jsonArray(driversJson)) {
    if (
      d &&
      typeof d === 'object' &&
      (d as Record<string, unknown>).kind === 'sale_probability'
    ) {
      const v = (d as Record<string, unknown>)[key]
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
  }
  return null
}

function serializeModel(row: Row) {
  return {
    runId: String(row.run_id),
    version: String(row.model_version),
    status: String(row.status),
    active: row.active === true,
    trainedAt: isoString(row.trained_at),
    dataCutoff: isoString(row.data_cutoff),
    trainingStartedAt: isoString(row.training_started_at),
    trainingFinishedAt: isoString(row.training_finished_at),
    metrics: jsonObject(row.metrics_json),
    config: jsonObject(row.config_json),
    createdAt: isoString(row.created_at),
    marketContextGeneratedAt: nullableIsoString(
      row.market_context_generated_at,
    ),
  }
}

function serializeMarketContext(row: Row) {
  return {
    runId: String(row.run_id),
    v2FloorWei: nullableBigStr(row.v2_floor_wei),
    v1FloorWei: nullableBigStr(row.v1_floor_wei),
    v2BidFloorWei: nullableBigStr(row.v2_bid_floor_wei),
    v1BidFloorWei: nullableBigStr(row.v1_bid_floor_wei),
    v2ListedCount: toInt(row.v2_listed_count),
    v1ListedCount: toInt(row.v1_listed_count),
    v2ActiveBidCount: toInt(row.v2_active_bid_count),
    v1ActiveBidCount: toInt(row.v1_active_bid_count),
    recentV2SalesCount: toInt(row.recent_v2_sales_count),
    recentV1SalesCount: toInt(row.recent_v1_sales_count),
    v1V2Multiplier: toFloat(row.v1_v2_multiplier),
    context: jsonObject(row.context_json),
    generatedAt: isoString(row.generated_at),
    model: {
      version: String(row.model_version),
      trainedAt: isoString(row.trained_at),
      dataCutoff: isoString(row.data_cutoff),
    },
  }
}

function normalizeRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[]
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: Row[] }).rows
  }
  return []
}

function parseStandard(value: string): Standard | null {
  return value === 'v1' || value === 'v2' ? value : null
}

function parsePunkId(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 && parsed < PUNK_COUNT
    ? parsed
    : null
}

function parseIds(value: string | undefined): number[] | null {
  if (value === undefined) return null
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length > MAX_BATCH_IDS) return null

  const ids: number[] = []
  const seen = new Set<number>()
  for (const part of parts) {
    const punkId = parsePunkId(part)
    if (punkId === null) return null
    if (!seen.has(punkId)) {
      seen.add(punkId)
      ids.push(punkId)
    }
  }
  return ids
}

function clampInt(
  value: string | undefined,
  fallback: number,
  lo: number,
  hi: number,
): number {
  if (value === undefined) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

function clampFloat(
  value: string | undefined,
  fallback: number,
  lo: number,
  hi: number,
): number {
  if (value === undefined) return fallback
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

function bigStr(value: unknown): string {
  if (value == null) return '0'
  return String(value)
}

function nullableBigStr(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function toInt(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number.parseInt(String(value), 10)
}

function toFloat(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number.parseFloat(String(value))
}

function isoString(value: unknown): string {
  const date = toDate(value)
  return date ? date.toISOString() : String(value)
}

function nullableIsoString(value: unknown): string | null {
  return value == null ? null : isoString(value)
}

// Postgres hands timestamptz columns back as text like
// "2026-06-02 22:20:00.473494+00", which is not ISO 8601. Normalize it so it
// parses consistently across runtimes (Safari rejects the space/"+00" form),
// then emit canonical UTC ISO.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value)
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber
  }
  if (typeof value !== 'string') return null
  const normalized = value
    .replace(' ', 'T') // date/time separator
    .replace(/(\.\d{3})\d+/, '$1') // microseconds -> milliseconds
    .replace(/([+-]\d{2})$/, '$1:00') // "+00" -> "+00:00"
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// Map each human head-variant trait to its skin tone, mirroring
// `usePunkDisplayTraits` in punks.auction. Alien/Ape/Zombie head variants have
// no skin tone and are dropped from prediction labels — they duplicate the Type
// trait of the same name.
const skinToneByHeadVariantName = new Map<string, string>()
for (const [tone, pair] of skinToneHeadVariants.entries()) {
  for (const headVariant of pair) {
    skinToneByHeadVariantName.set(
      headVariantNames[headVariant],
      skinToneNames[tone]!,
    )
  }
}

// Front-end-aligned display name for a trait premium, or null when the trait
// carries no standalone label and should be dropped. Mirrors
// `usePunkDisplayTraits` (punks.auction) and `display_trait_name` (predictor):
//   - human head variants            -> "<Dark|Brown|Fair|Albino> skin"
//   - Alien/Ape/Zombie head variants -> null (drop)
//   - "1 Attributes"                 -> "1 Attribute" (singular)
//   - everything else                -> the raw catalog name
function displayTraitName(traitId: number): string | null {
  const name = offlinePunks.getTraitNameSync(traitId)
  const kind = offlinePunks.getTraitKindSync(traitId)
  if (kind === TraitKind.HeadVariant) {
    const tone = skinToneByHeadVariantName.get(name)
    return tone === undefined ? null : `${tone} skin`
  }
  if (kind === TraitKind.AttributeCount) {
    const match = name.match(/^(\d+) Attributes$/)
    if (match) {
      const count = Number(match[1])
      return `${count} ${count === 1 ? 'Attribute' : 'Attributes'}`
    }
  }
  return name
}

function withTraitPremiumLabels(items: unknown[]): unknown[] {
  const out: unknown[] = []
  const seenTraitNames = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      out.push(item)
      continue
    }

    const row = item as Record<string, unknown>
    const traitId = traitIdFrom(row.traitId)
    if (traitId === null) {
      out.push(item)
      continue
    }

    const traitName = displayTraitName(traitId)
    if (traitName === null || !isPositiveTraitPremium(row)) continue
    if (seenTraitNames.has(traitName)) continue
    seenTraitNames.add(traitName)

    const normalized: Record<string, unknown> = {
      ...row,
      traitName,
    }
    normalized.label = `${traitName} premium`
    out.push(normalized)
  }
  return out
}

function isPositiveTraitPremium(row: Record<string, unknown>): boolean {
  const logPremium = finiteNumber(row.logPremium)
  if (logPremium !== null) return logPremium > 0

  const multiplier = finiteNumber(row.multiplier)
  if (multiplier !== null) return multiplier > 1

  return true
}

function finiteNumber(value: unknown): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? number : null
}

function traitIdFrom(value: unknown): number | null {
  const traitId =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isInteger(traitId) && traitId >= 0 && traitId < TRAIT_COUNT
    ? traitId
    : null
}

export default app
