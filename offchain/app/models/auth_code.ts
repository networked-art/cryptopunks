import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

const PIN_TTL_MINUTES = 15

export default class AuthCode extends BaseModel {
  @column({ isPrimary: true })
  declare userId: number

  @column()
  declare code: number

  @column()
  declare channel: 'email'

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare consumedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  static async newFor(user: User, channel: 'email' = 'email') {
    const row = await AuthCode.firstOrNew({ userId: user.id })
    row.code = crypto.randomInt(100_000, 1_000_000)
    row.channel = channel
    row.expiresAt = DateTime.now().plus({ minutes: PIN_TTL_MINUTES })
    row.consumedAt = null
    await row.save()
    return row
  }

  isValid(code: number) {
    if (this.consumedAt) return false
    if (this.code !== code) return false
    return this.expiresAt > DateTime.now()
  }

  async consume() {
    this.consumedAt = DateTime.now()
    await this.save()
  }
}
