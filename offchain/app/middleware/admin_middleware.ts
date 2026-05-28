import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'
import { HttpError } from '#exceptions/http_error'

/**
 * Restricts a route to admin users. Admin status is derived from the
 * comma-separated `ADMIN_EMAILS` env var matched against the authenticated
 * user's verified email.
 */
export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    if (!user) throw new HttpError(401, 'Unauthorized')

    const admins = env
      .get('ADMIN_EMAILS', '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)

    const email = user.email?.toLowerCase()
    if (!email || !admins.includes(email)) {
      throw new HttpError(403, 'Forbidden')
    }
    return next()
  }
}
