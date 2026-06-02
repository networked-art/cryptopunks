import { Hono } from 'hono'
import type { Context } from 'hono'
import { OfflinePunksDataClient } from '@networked-art/punks-sdk/offline'
import { sql } from 'ponder'
import { db } from 'ponder:api'

const PUNK_COUNT = 10000
const MAX_BATCH_IDS = 200
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

function withTraitPremiumLabels(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item

    const row = item as Record<string, unknown>
    const traitId = traitIdFrom(row.traitId)
    if (traitId === null) return item

    const traitName = offlinePunks.getTraitNameSync(traitId)
    const normalized: Record<string, unknown> = {
      ...row,
      traitName,
    }
    if (row.kind === 'trait' || typeof row.label === 'string') {
      normalized.label = `${traitName} premium`
    }
    return normalized
  })
}

function traitIdFrom(value: unknown): number | null {
  const traitId =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isInteger(traitId) && traitId >= 0 && traitId < TRAIT_COUNT
    ? traitId
    : null
}

export default app
