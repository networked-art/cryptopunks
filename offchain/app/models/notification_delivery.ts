import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type NotificationDeliveryStatus = 'queued' | 'sent' | 'failed'
export type NotificationDeliveryChannel = 'email'

export default class NotificationDelivery extends BaseModel {
  static table = 'notification_deliveries'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare channel: NotificationDeliveryChannel

  @column()
  declare type: string

  @column({
    prepare: (v: Record<string, unknown>) => JSON.stringify(v ?? {}),
    consume: (v: string | Record<string, unknown>) =>
      typeof v === 'string' ? JSON.parse(v) : (v ?? {}),
  })
  declare payload: Record<string, unknown>

  @column()
  declare dedupeKey: string

  @column()
  declare status: NotificationDeliveryStatus

  @column()
  declare attemptCount: number

  @column()
  declare lastError: string | null

  @column.dateTime()
  declare queuedAt: DateTime

  @column.dateTime()
  declare sentAt: DateTime | null

  @column.dateTime()
  declare failedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
