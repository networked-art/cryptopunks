import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_codes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer('user_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .primary()

      table.integer('code').notNullable()
      table.string('channel').notNullable().defaultTo('email')
      table.timestamp('expires_at').notNullable()
      table.timestamp('consumed_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
