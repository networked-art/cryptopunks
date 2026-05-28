import { BaseTransformer } from '@adonisjs/core/transformers'
import type { DateTime } from 'luxon'
import type User from '#models/user'
import UserTransformer from '#transformers/user_transformer'

export type AuthSessionResource = {
  token: string
  expiresAt: DateTime | Date | null
  user: User
}

export default class AuthSessionTransformer extends BaseTransformer<AuthSessionResource> {
  toObject() {
    return {
      token: this.resource.token,
      expires_at: this.resource.expiresAt,
      user: UserTransformer.transform(this.resource.user).useVariant('forSelf'),
    }
  }
}
