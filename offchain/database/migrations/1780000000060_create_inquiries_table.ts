import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'inquiries'

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
      table
        .integer('search_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('searches')
        .onDelete('CASCADE')
        .index()

      table.text('note').nullable()
      table.string('max_price_wei', 80).nullable()
      table.string('status', 16).notNullable().defaultTo('open')
      table.timestamp('status_changed_at').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
