import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Inquiry from '#models/inquiry'
import SearchMatch from '#models/search_match'
import type { CriteriaInput } from '#services/criteria'
import type { ActivityKind, ActivitySource } from '#services/indexer_client'

const DEFAULT_NOTIFY_SOURCES: ActivitySource[] = [
  'cryptopunks_v2',
  'wrapped_punks',
  'cryptopunks_721',
  'punks_auction',
]

const DEFAULT_NOTIFY_KINDS: ActivityKind[] = ['listing', 'lot_created', 'auction_started']

export type NotifyFrequency = 'immediate' | 'hourly' | 'daily'

function consumeJson<T>(value: unknown): T {
  if (value === null || value === undefined) return undefined as T
  if (typeof value === 'string') return JSON.parse(value) as T
  return value as T
}

function prepareJson(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

export default class Search extends BaseModel {
  static table = 'searches'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  @column({
    prepare: (v: CriteriaInput) => JSON.stringify(v),
    consume: (v) => consumeJson<CriteriaInput>(v),
  })
  declare criteria: CriteriaInput

  @column()
  declare notify: boolean

  @column()
  declare notifyFrequency: NotifyFrequency

  @column({
    prepare: (v: ActivitySource[]) => JSON.stringify(v ?? DEFAULT_NOTIFY_SOURCES),
    consume: (v) => consumeJson<ActivitySource[]>(v) ?? DEFAULT_NOTIFY_SOURCES,
  })
  declare notifySources: ActivitySource[]

  @column({
    prepare: (v: ActivityKind[]) => JSON.stringify(v ?? DEFAULT_NOTIFY_KINDS),
    consume: (v) => consumeJson<ActivityKind[]>(v) ?? DEFAULT_NOTIFY_KINDS,
  })
  declare notifyKinds: ActivityKind[]

  @column({ prepare: prepareJson })
  declare maxPriceWei: string | null

  @column.dateTime()
  declare lastMatchedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Inquiry)
  declare inquiries: HasMany<typeof Inquiry>

  @hasMany(() => SearchMatch)
  declare matches: HasMany<typeof SearchMatch>
}

export { DEFAULT_NOTIFY_SOURCES, DEFAULT_NOTIFY_KINDS }
