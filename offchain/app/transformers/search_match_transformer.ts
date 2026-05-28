import { BaseTransformer } from '@adonisjs/core/transformers'
import type SearchMatch from '#models/search_match'

export default class SearchMatchTransformer extends BaseTransformer<SearchMatch> {
  toObject() {
    return {
      id: this.resource.id,
      search_id: this.resource.searchId,
      event_id: this.resource.eventId,
      token_id: this.resource.tokenId,
      matched_at: this.resource.matchedAt,
      delivery_id: this.resource.deliveryId,
    }
  }
}
