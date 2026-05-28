import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_addresses'

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

      table.string('address', 42).notNullable().unique()
      table.text('verification_message').nullable()
      table.text('verification_signature').nullable()
      table.timestamp('verified_at').nullable()
      table.boolean('is_primary').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    if (this.db.dialect.name === 'postgres') {
      this.schema.raw(
        'CREATE UNIQUE INDEX user_addresses_user_id_primary_unique ON user_addresses (user_id) WHERE is_primary'
      )
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
