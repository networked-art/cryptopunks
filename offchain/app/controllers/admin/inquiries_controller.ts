import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Inquiry from '#models/inquiry'
import { HttpError } from '#exceptions/http_error'
import { serialize } from '#services/serializer'
import InquiryTransformer from '#transformers/inquiry_transformer'
import { adminUpdateInquiryValidator } from '#validators/inquiries'
import NotificationDelivery from '#models/notification_delivery'

export default class AdminInquiriesController {
  async index({ request }: HttpContext) {
    const status = (request.qs().status as string) || 'open'
    const rows = await Inquiry.query().where('status', status).orderBy('createdAt', 'desc')
    return serialize({
      inquiries: InquiryTransformer.transform(rows).useVariant('forAdmin'),
    })
  }

  async update({ params, request }: HttpContext) {
    const inquiry = await Inquiry.find(Number(params.id))
    if (!inquiry) throw new HttpError(404, 'Inquiry not found')

    const { status } = await request.validateUsing(adminUpdateInquiryValidator)
    if (inquiry.status === status) {
      return serialize({ inquiry: InquiryTransformer.transform(inquiry).useVariant('forAdmin') })
    }

    inquiry.status = status
    inquiry.statusChangedAt = DateTime.now()
    await inquiry.save()

    await NotificationDelivery.create({
      userId: inquiry.userId,
      channel: 'email',
      type: 'inquiry_status_changed',
      payload: { inquiryId: inquiry.id, status, searchId: inquiry.searchId },
      dedupeKey: `inquiry:${inquiry.id}:${status}:${DateTime.now().toMillis()}`,
      status: 'queued',
      attemptCount: 0,
      lastError: null,
      queuedAt: DateTime.now(),
      sentAt: null,
      failedAt: null,
    })

    return serialize({ inquiry: InquiryTransformer.transform(inquiry).useVariant('forAdmin') })
  }
}
