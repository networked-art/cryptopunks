import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Search from '#models/search'

export type InquiryStatus = 'open' | 'contacted' | 'fulfilled' | 'cancelled'

export default class Inquiry extends BaseModel {
  static table = 'inquiries'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare searchId: number

  @column()
  declare note: string | null

  @column()
  declare maxPriceWei: string | null

  @column()
  declare status: InquiryStatus

  @column.dateTime()
  declare statusChangedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Search)
  declare search: BelongsTo<typeof Search>
}
