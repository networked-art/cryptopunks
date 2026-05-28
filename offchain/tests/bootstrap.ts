import { rm } from 'node:fs/promises'
import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { QueueSchemaService } from '@adonisjs/queue'

let closeHttpServer: (() => Promise<void>) | null = null

async function setupTestDatabase() {
  if (process.env.DB_CONNECTION === 'sqlite') {
    await rm(app.tmpPath('db.sqlite3'), { force: true })
  }

  const schema = db.connection().schema
  const queueSchema = new QueueSchemaService((db.connection() as any).getWriteClient())

  await schema.dropTableIfExists('notification_deliveries')
  await schema.dropTableIfExists('search_matches')
  await schema.dropTableIfExists('inquiries')
  await schema.dropTableIfExists('searches')
  await schema.dropTableIfExists('indexer_cursor')
  await schema.dropTableIfExists('auth_codes')
  await schema.dropTableIfExists('auth_access_tokens')
  await schema.dropTableIfExists('user_addresses')
  await schema.dropTableIfExists('queue_schedules')
  await schema.dropTableIfExists('queue_jobs')
  await schema.dropTableIfExists('users')

  await schema.createTable('users', (table) => {
    table.increments('id').notNullable()
    table.string('email').nullable().unique()
    table.timestamp('email_verified_at').nullable()
    table.string('display_name', 100).nullable()
    table.text('settings').notNullable().defaultTo('{}')
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await schema.createTable('user_addresses', (table) => {
    table.increments('id').notNullable()
    table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
    table.string('address', 42).notNullable().unique()
    table.text('verification_message').nullable()
    table.text('verification_signature').nullable()
    table.timestamp('verified_at').nullable()
    table.boolean('is_primary').notNullable().defaultTo(false)
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await schema.createTable('auth_codes', (table) => {
    table.integer('user_id').notNullable().unsigned().primary()
    table.integer('code').notNullable()
    table.string('channel').notNullable().defaultTo('email')
    table.timestamp('expires_at').notNullable()
    table.timestamp('consumed_at').nullable()
  })

  await schema.createTable('auth_access_tokens', (table) => {
    table.increments('id')
    table.integer('tokenable_id').notNullable().unsigned().references('id').inTable('users')
    table.string('type').notNullable()
    table.string('name').nullable()
    table.string('hash').notNullable()
    table.text('abilities').notNullable()
    table.timestamp('created_at')
    table.timestamp('updated_at')
    table.timestamp('last_used_at').nullable()
    table.timestamp('expires_at').nullable()
  })

  await schema.createTable('searches', (table) => {
    table.increments('id').notNullable()
    table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
    table.string('name', 120).notNullable()
    table.text('criteria').notNullable()
    table.boolean('notify').notNullable().defaultTo(false)
    table.string('notify_frequency', 16).notNullable().defaultTo('immediate')
    table.text('notify_sources').notNullable()
    table.text('notify_kinds').notNullable()
    table.string('max_price_wei', 80).nullable()
    table.timestamp('last_matched_at').nullable()
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await schema.createTable('inquiries', (table) => {
    table.increments('id').notNullable()
    table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
    table.integer('search_id').notNullable().unsigned().references('id').inTable('searches')
    table.text('note').nullable()
    table.string('max_price_wei', 80).nullable()
    table.string('status', 16).notNullable().defaultTo('open')
    table.timestamp('status_changed_at').notNullable()
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await schema.createTable('search_matches', (table) => {
    table.increments('id').notNullable()
    table.integer('search_id').notNullable().unsigned().references('id').inTable('searches')
    table.text('event_id').notNullable()
    table.integer('token_id').notNullable()
    table.timestamp('matched_at').notNullable()
    table.integer('delivery_id').nullable().unsigned()
    table.unique(['search_id', 'event_id'])
  })

  await schema.createTable('notification_deliveries', (table) => {
    table.increments('id').notNullable()
    table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
    table.string('channel', 16).notNullable().defaultTo('email')
    table.string('type', 48).notNullable()
    table.text('payload').notNullable()
    table.string('dedupe_key', 200).notNullable().unique()
    table.string('status', 16).notNullable().defaultTo('queued')
    table.integer('attempt_count').notNullable().defaultTo(0)
    table.text('last_error').nullable()
    table.timestamp('queued_at').notNullable()
    table.timestamp('sent_at').nullable()
    table.timestamp('failed_at').nullable()
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await schema.createTable('indexer_cursor', (table) => {
    table.string('key', 64).notNullable().primary()
    table.bigInteger('last_block_number').notNullable().defaultTo(0)
    table.integer('last_log_index').notNullable().defaultTo(0)
    table.text('last_event_id').nullable()
    table.timestamp('started_at').nullable()
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
  })

  await queueSchema.createJobsTable()
  await queueSchema.createSchedulesTable()
}

async function startHttpServer() {
  await testUtils.boot()
  closeHttpServer = await testUtils.httpServer().start()
}

async function stopHttpServer() {
  if (closeHttpServer) {
    await closeHttpServer()
    closeHttpServer = null
  }
}

export const plugins = [assert(), apiClient(), pluginAdonisJS(app)]

export const runnerHooks: {
  setup: (() => void | Promise<void>)[]
  teardown: (() => void | Promise<void>)[]
} = {
  setup: [setupTestDatabase, startHttpServer],
  teardown: [stopHttpServer, () => db.manager.closeAll()],
}
