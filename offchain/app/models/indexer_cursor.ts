import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class IndexerCursor extends BaseModel {
  static table = 'indexer_cursor'

  @column({ isPrimary: true })
  declare key: string

  @column({
    prepare: (v: bigint | number | string | null) =>
      v === null || v === undefined ? null : typeof v === 'bigint' ? v.toString() : String(v),
    consume: (v) => (v === null || v === undefined ? 0n : BigInt(v)),
  })
  declare lastBlockNumber: bigint

  @column()
  declare lastLogIndex: number

  @column()
  declare lastEventId: string | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
