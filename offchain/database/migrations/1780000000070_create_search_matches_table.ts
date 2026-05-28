import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'search_matches'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('search_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('searches')
        .onDelete('CASCADE')
        .index()

      table.text('event_id').notNullable()
      table.integer('token_id').notNullable()
      table.timestamp('matched_at').notNullable()
      table.integer('delivery_id').nullable().unsigned()

      table.unique(['search_id', 'event_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
