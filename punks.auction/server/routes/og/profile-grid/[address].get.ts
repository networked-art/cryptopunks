import { loadProfileOgData } from '~/utils/profileOg'
import { renderPunkOgGrid } from '~~/server/utils/punkOgGrid'

const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

export default defineEventHandler(async (event) => {
  const address = getRouterParam(event, 'address') ?? ''
  const profile = await loadProfileOgData(address)
  if (!profile || profile.ids.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No profile Punk grid',
    })
  }

  const body = await renderPunkOgGrid(profile.ids)

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'cache-control', CACHE_CONTROL)
  return body
})
