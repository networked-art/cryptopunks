import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export const BEARER_COOKIE = 'oc_bearer'

/**
 * Copy the bearer token from the `oc_bearer` cookie into the Authorization
 * header so the access-tokens guard can authenticate browser clients that
 * cannot read httpOnly cookies from JS.
 */
export default class CookieTokenMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!ctx.request.header('authorization')) {
      const cookie = ctx.request.plainCookie(BEARER_COOKIE) || ctx.request.cookie(BEARER_COOKIE)
      if (cookie) {
        ctx.request.request.headers['authorization'] = `Bearer ${cookie}`
      }
    }
    return next()
  }
}
