import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import type User from '#models/user'
import { BEARER_COOKIE } from '#middleware/cookie_token_middleware'
import AuthSessionTransformer, {
  type AuthSessionResource,
} from '#transformers/auth_session_transformer'
import { serialize } from '#services/serializer'

export async function issueTokenFor(ctx: HttpContext, user: User, name: string) {
  const [token] = await Promise.all([user.issueToken(name), user.load('addresses')])
  const secret = token.value!.release()

  ctx.response.cookie(BEARER_COOKIE, secret, {
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: '1y',
  })

  const session: AuthSessionResource = {
    token: secret,
    expiresAt: token.expiresAt ?? null,
    user,
  }
  return serialize(AuthSessionTransformer.transform(session))
}
