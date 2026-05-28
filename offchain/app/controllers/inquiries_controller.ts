import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Inquiry from '#models/inquiry'
import Search from '#models/search'
import { HttpError } from '#exceptions/http_error'
import { serialize } from '#services/serializer'
import InquiryTransformer from '#transformers/inquiry_transformer'
import { createInquiryValidator, updateInquiryValidator } from '#validators/inquiries'

async function loadOwned(userId: number, id: number) {
  const inquiry = await Inquiry.find(id)
  if (!inquiry || inquiry.userId !== userId) throw new HttpError(404, 'Inquiry not found')
  return inquiry
}

export default class InquiriesController {
  async index({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const rows = await Inquiry.query().where('userId', user.id).orderBy('createdAt', 'desc')
    return serialize({ inquiries: InquiryTransformer.transform(rows) })
  }

  async store({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createInquiryValidator)

    const search = await Search.find(data.searchId)
    if (!search || search.userId !== user.id) {
      throw new HttpError(404, 'Search not found')
    }

    const inquiry = await Inquiry.create({
      userId: user.id,
      searchId: search.id,
      note: data.note ?? null,
      maxPriceWei: data.maxPriceWei ?? search.maxPriceWei,
      status: 'open',
      statusChangedAt: DateTime.now(),
    })

    return serialize({ inquiry: InquiryTransformer.transform(inquiry) })
  }

  async show({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const inquiry = await loadOwned(user.id, Number(params.id))
    return serialize({ inquiry: InquiryTransformer.transform(inquiry) })
  }

  async update({ params, request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const inquiry = await loadOwned(user.id, Number(params.id))
    if (inquiry.status !== 'open') {
      throw new HttpError(400, `Inquiry is ${inquiry.status} and cannot be edited`)
    }
    const data = await request.validateUsing(updateInquiryValidator)

    if (data.note !== undefined) inquiry.note = data.note
    if (data.maxPriceWei !== undefined) inquiry.maxPriceWei = data.maxPriceWei
    await inquiry.save()

    return serialize({ inquiry: InquiryTransformer.transform(inquiry) })
  }

  async cancel({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const inquiry = await loadOwned(user.id, Number(params.id))
    if (inquiry.status === 'cancelled' || inquiry.status === 'fulfilled') {
      throw new HttpError(400, `Inquiry already ${inquiry.status}`)
    }
    inquiry.status = 'cancelled'
    inquiry.statusChangedAt = DateTime.now()
    await inquiry.save()

    return serialize({ inquiry: InquiryTransformer.transform(inquiry) })
  }
}
