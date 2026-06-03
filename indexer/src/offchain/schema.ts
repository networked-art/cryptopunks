import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

type EnsProfileData = {
  avatar: string
  header: string
  description: string
  links: {
    url: string
    email: string
    twitter: string
    github: string
  }
}

export const offchainSchema = pgSchema('offchain')

export const ensProfile = offchainSchema.table('ens_profile', {
  address: text('address').primaryKey(),
  ens: text('ens'),
  data: json('data').$type<EnsProfileData>(),
  updatedAt: integer('updated_at').notNull(),
})

export const predictionModelRun = offchainSchema.table(
  'prediction_model_runs',
  {
    runId: text('run_id').primaryKey(),
    modelVersion: text('model_version').notNull(),
    status: text('status').notNull(),
    active: boolean('active').notNull().default(false),
    trainedAt: timestamp('trained_at', { withTimezone: true }).notNull(),
    dataCutoff: timestamp('data_cutoff', { withTimezone: true }).notNull(),
    trainingStartedAt: timestamp('training_started_at', {
      withTimezone: true,
    }).notNull(),
    trainingFinishedAt: timestamp('training_finished_at', {
      withTimezone: true,
    }).notNull(),
    metricsJson: jsonb('metrics_json').notNull(),
    configJson: jsonb('config_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    activeIdx: index('prediction_model_runs_active_idx').on(table.active),
    trainedAtIdx: index('prediction_model_runs_trained_at_idx').on(
      table.trainedAt,
    ),
    activeUnique: uniqueIndex('prediction_model_runs_active_unique')
      .on(table.active)
      .where(sql`${table.active} = true`),
    statusCheck: check(
      'prediction_model_runs_status_check',
      sql`${table.status} in ('active', 'superseded', 'failed')`,
    ),
  }),
)

export const punkPrediction = offchainSchema.table(
  'punk_predictions',
  {
    runId: text('run_id')
      .notNull()
      .references(() => predictionModelRun.runId, { onDelete: 'cascade' }),
    standard: text('standard').notNull(),
    punkId: integer('punk_id').notNull(),
    quickSaleWei: numeric('quick_sale_wei', {
      precision: 78,
      scale: 0,
    }).notNull(),
    fairValueWei: numeric('fair_value_wei', {
      precision: 78,
      scale: 0,
    }).notNull(),
    p10SaleWei: numeric('p10_sale_wei', {
      precision: 78,
      scale: 0,
    }).notNull(),
    p50SaleWei: numeric('p50_sale_wei', {
      precision: 78,
      scale: 0,
    }).notNull(),
    p90SaleWei: numeric('p90_sale_wei', {
      precision: 78,
      scale: 0,
    }).notNull(),
    saleProbability24h: numeric('sale_probability_24h', {
      precision: 8,
      scale: 6,
    }).notNull(),
    confidence: text('confidence').notNull(),
    driversJson: jsonb('drivers_json').notNull(),
    compsJson: jsonb('comps_json').notNull(),
    traitPremiumsJson: jsonb('trait_premiums_json').notNull(),
    marketContextJson: jsonb('market_context_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.standard, table.punkId] }),
    punkIdx: index('punk_predictions_standard_punk_idx').on(
      table.standard,
      table.punkId,
    ),
    standardCheck: check(
      'punk_predictions_standard_check',
      sql`${table.standard} in ('v1', 'v2')`,
    ),
    punkIdCheck: check(
      'punk_predictions_punk_id_check',
      sql`${table.punkId} >= 0 and ${table.punkId} < 10000`,
    ),
    confidenceCheck: check(
      'punk_predictions_confidence_check',
      sql`${table.confidence} in ('low', 'medium', 'high')`,
    ),
    probabilityCheck: check(
      'punk_predictions_probability_check',
      sql`${table.saleProbability24h} >= 0 and ${table.saleProbability24h} <= 1`,
    ),
    quantileOrderCheck: check(
      'punk_predictions_quantile_order_check',
      sql`${table.p10SaleWei} <= ${table.p50SaleWei} and ${table.p50SaleWei} <= ${table.p90SaleWei}`,
    ),
  }),
)

export const predictionMarketContext = offchainSchema.table(
  'prediction_market_context',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => predictionModelRun.runId, { onDelete: 'cascade' }),
    v2FloorWei: numeric('v2_floor_wei', {
      precision: 78,
      scale: 0,
    }),
    v1FloorWei: numeric('v1_floor_wei', {
      precision: 78,
      scale: 0,
    }),
    v2BidFloorWei: numeric('v2_bid_floor_wei', {
      precision: 78,
      scale: 0,
    }),
    v1BidFloorWei: numeric('v1_bid_floor_wei', {
      precision: 78,
      scale: 0,
    }),
    v2ListedCount: integer('v2_listed_count').notNull(),
    v1ListedCount: integer('v1_listed_count').notNull(),
    v2ActiveBidCount: integer('v2_active_bid_count').notNull(),
    v1ActiveBidCount: integer('v1_active_bid_count').notNull(),
    recentV2SalesCount: integer('recent_v2_sales_count').notNull(),
    recentV1SalesCount: integer('recent_v1_sales_count').notNull(),
    v1V2Multiplier: numeric('v1_v2_multiplier', {
      precision: 12,
      scale: 6,
    }).notNull(),
    contextJson: jsonb('context_json').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
  },
)

export const predictionBacktest = offchainSchema.table(
  'prediction_backtests',
  {
    runId: text('run_id')
      .notNull()
      .references(() => predictionModelRun.runId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    metricsJson: jsonb('metrics_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.name] }),
  }),
)
