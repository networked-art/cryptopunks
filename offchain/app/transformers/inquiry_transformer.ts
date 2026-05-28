import { BaseTransformer } from '@adonisjs/core/transformers'
import type Inquiry from '#models/inquiry'

export default class InquiryTransformer extends BaseTransformer<Inquiry> {
  toObject() {
    return {
      id: this.resource.id,
      search_id: this.resource.searchId,
      note: this.resource.note,
      max_price_wei: this.resource.maxPriceWei,
      status: this.resource.status,
      status_changed_at: this.resource.statusChangedAt,
      created_at: this.resource.createdAt,
      updated_at: this.resource.updatedAt,
    }
  }

  forAdmin() {
    return {
      ...this.toObject(),
      user_id: this.resource.userId,
    }
  }
}
