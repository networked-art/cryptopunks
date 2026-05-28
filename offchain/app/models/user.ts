import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, beforeSave, column, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import UserAddress from '#models/user_address'
import AuthCode from '#models/auth_code'

export type DigestFrequency = 'immediate' | 'hourly' | 'daily' | 'off'

export type UserSettings = {
  emailEnabled: boolean
  digestFrequency: DigestFrequency
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  emailEnabled: true,
  digestFrequency: 'immediate',
  quietHoursStart: null,
  quietHoursEnd: null,
}

function normalizeSettings(value: unknown): UserSettings {
  const input = value && typeof value === 'object' ? (value as Partial<UserSettings>) : {}
  return {
    emailEnabled:
      typeof input.emailEnabled === 'boolean'
        ? input.emailEnabled
        : DEFAULT_USER_SETTINGS.emailEnabled,
    digestFrequency:
      input.digestFrequency === 'immediate' ||
      input.digestFrequency === 'hourly' ||
      input.digestFrequency === 'daily' ||
      input.digestFrequency === 'off'
        ? input.digestFrequency
        : DEFAULT_USER_SETTINGS.digestFrequency,
    quietHoursStart:
      typeof input.quietHoursStart === 'number' ? input.quietHoursStart : null,
    quietHoursEnd: typeof input.quietHoursEnd === 'number' ? input.quietHoursEnd : null,
  }
}

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string | null

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  @column()
  declare displayName: string | null

  @column({
    prepare: (value: UserSettings) => JSON.stringify(normalizeSettings(value)),
    consume: (value: string | UserSettings) =>
      normalizeSettings(typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare settings: UserSettings

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeSave()
  static lowercaseEmail(user: User) {
    if (user.email) user.email = user.email.toLowerCase()
  }

  @beforeCreate()
  static seedSettings(user: User) {
    if (!user.settings) user.settings = DEFAULT_USER_SETTINGS
  }

  @hasMany(() => UserAddress)
  declare addresses: HasMany<typeof UserAddress>

  @hasOne(() => AuthCode)
  declare authCode: HasOne<typeof AuthCode>

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '1 year',
    prefix: 'oc_',
  })

  currentAccessToken?: AccessToken

  async issueToken(name: string) {
    return User.accessTokens.create(this, ['*'], { name })
  }

  async markEmailVerified() {
    if (!this.emailVerifiedAt) {
      this.emailVerifiedAt = DateTime.now()
      await this.save()
    }
    return this
  }
}
