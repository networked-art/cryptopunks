import { resolveSearchOg } from '~/utils/searchOg'
import { renderPunkOgGrid } from '~~/server/utils/punkOgGrid'

const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = stringQueryValue(query.q)
  const sale = stringQueryValue(query.sale) === '1'
  const search = await resolveSearchOg({ q, sale })
  if (!search || search.ids.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No search Punk grid',
    })
  }

  const body = await renderPunkOgGrid(search.ids)

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'cache-control', CACHE_CONTROL)
  return body
})

function stringQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}
