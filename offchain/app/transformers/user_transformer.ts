import { BaseTransformer } from '@adonisjs/core/transformers'
import type User from '#models/user'
import { userAddressToObject } from '#transformers/user_address_transformer'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    return {
      id: this.resource.id,
      display_name: this.resource.displayName,
      addresses: this.resource.addresses?.map(userAddressToObject) ?? [],
    }
  }

  forSelf() {
    return {
      ...this.toObject(),
      email: this.resource.email,
      email_verified_at: this.resource.emailVerifiedAt,
      settings: this.resource.settings,
    }
  }
}
