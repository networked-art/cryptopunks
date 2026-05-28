import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'searches'

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

      table.string('name', 120).notNullable()
      table.jsonb('criteria').notNullable()
      table.boolean('notify').notNullable().defaultTo(false)
      table.string('notify_frequency', 16).notNullable().defaultTo('immediate')
      table.jsonb('notify_sources').notNullable()
      table.jsonb('notify_kinds').notNullable()
      table.string('max_price_wei', 80).nullable()
      table.timestamp('last_matched_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
