import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notification_deliveries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .index()

      table.string('channel', 16).notNullable().defaultTo('email')
      table.string('type', 48).notNullable()
      table.jsonb('payload').notNullable()
      table.string('dedupe_key', 200).notNullable().unique()
      table.string('status', 16).notNullable().defaultTo('queued')
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.text('last_error').nullable()
      table.timestamp('queued_at').notNullable()
      table.timestamp('sent_at').nullable()
      table.timestamp('failed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['status', 'queued_at'], 'notification_deliveries_status_queued_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
