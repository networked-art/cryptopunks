import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Search from '#models/search'

export default class SearchMatch extends BaseModel {
  static table = 'search_matches'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare searchId: number

  @column()
  declare eventId: string

  @column()
  declare tokenId: number

  @column.dateTime()
  declare matchedAt: DateTime

  @column()
  declare deliveryId: number | null

  @belongsTo(() => Search)
  declare search: BelongsTo<typeof Search>
}
