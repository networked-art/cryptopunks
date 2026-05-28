import { BaseTransformer } from '@adonisjs/core/transformers'
import type UserAddress from '#models/user_address'

export function userAddressToObject(address: UserAddress) {
  return {
    address: address.address,
    is_primary: address.isPrimary,
    verified_at: address.verifiedAt,
  }
}

export default class UserAddressTransformer extends BaseTransformer<UserAddress> {
  toObject() {
    return userAddressToObject(this.resource)
  }
}
