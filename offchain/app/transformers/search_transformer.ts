import { BaseTransformer } from '@adonisjs/core/transformers'
import type Search from '#models/search'

export default class SearchTransformer extends BaseTransformer<Search> {
  toObject() {
    return {
      id: this.resource.id,
      name: this.resource.name,
      criteria: this.resource.criteria,
      notify: this.resource.notify,
      notify_frequency: this.resource.notifyFrequency,
      notify_sources: this.resource.notifySources,
      notify_kinds: this.resource.notifyKinds,
      max_price_wei: this.resource.maxPriceWei,
      last_matched_at: this.resource.lastMatchedAt,
      created_at: this.resource.createdAt,
      updated_at: this.resource.updatedAt,
    }
  }
}
