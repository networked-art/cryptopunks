import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'indexer_cursor'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('key', 64).notNullable().primary()
      table.bigInteger('last_block_number').notNullable().defaultTo(0)
      table.integer('last_log_index').notNullable().defaultTo(0)
      table.text('last_event_id').nullable()
      table.timestamp('started_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
