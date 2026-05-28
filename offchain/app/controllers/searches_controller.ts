import type { HttpContext } from '@adonisjs/core/http'
import Search, { DEFAULT_NOTIFY_KINDS, DEFAULT_NOTIFY_SOURCES } from '#models/search'
import SearchMatch from '#models/search_match'
import { HttpError } from '#exceptions/http_error'
import { parseCriteria } from '#services/criteria'
import { serialize } from '#services/serializer'
import SearchTransformer from '#transformers/search_transformer'
import SearchMatchTransformer from '#transformers/search_match_transformer'
import { createSearchValidator, updateSearchValidator } from '#validators/searches'

async function loadOwned(userId: number, id: number) {
  const search = await Search.find(id)
  if (!search || search.userId !== userId) throw new HttpError(404, 'Search not found')
  return search
}

export default class SearchesController {
  async index({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const searches = await Search.query()
      .where('userId', user.id)
      .orderBy('createdAt', 'desc')
    return serialize({ searches: SearchTransformer.transform(searches) })
  }

  async store({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createSearchValidator)
    const criteria = parseCriteria(data.criteria)

    const search = await Search.create({
      userId: user.id,
      name: data.name,
      criteria,
      notify: data.notify ?? false,
      notifyFrequency: data.notifyFrequency ?? 'immediate',
      notifySources: data.notifySources ?? DEFAULT_NOTIFY_SOURCES,
      notifyKinds: data.notifyKinds ?? DEFAULT_NOTIFY_KINDS,
      maxPriceWei: data.maxPriceWei ?? null,
    })

    return serialize({ search: SearchTransformer.transform(search) })
  }

  async show({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const search = await loadOwned(user.id, Number(params.id))
    return serialize({ search: SearchTransformer.transform(search) })
  }

  async update({ params, request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const search = await loadOwned(user.id, Number(params.id))
    const data = await request.validateUsing(updateSearchValidator)

    if (data.name !== undefined) search.name = data.name
    if (data.criteria !== undefined) search.criteria = parseCriteria(data.criteria)
    if (data.notify !== undefined) search.notify = data.notify
    if (data.notifyFrequency !== undefined) search.notifyFrequency = data.notifyFrequency
    if (data.notifySources !== undefined) search.notifySources = data.notifySources
    if (data.notifyKinds !== undefined) search.notifyKinds = data.notifyKinds
    if (data.maxPriceWei !== undefined) search.maxPriceWei = data.maxPriceWei

    await search.save()
    return serialize({ search: SearchTransformer.transform(search) })
  }

  async destroy({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const search = await loadOwned(user.id, Number(params.id))
    await search.delete()
    return { ok: true }
  }

  async matches({ params, request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const search = await loadOwned(user.id, Number(params.id))

    const limit = Math.min(Number(request.qs().limit ?? 50), 200)
    const rows = await SearchMatch.query()
      .where('searchId', search.id)
      .orderBy('matchedAt', 'desc')
      .limit(limit)

    return serialize({ matches: SearchMatchTransformer.transform(rows) })
  }
}
