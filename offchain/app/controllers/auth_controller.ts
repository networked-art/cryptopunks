import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserAddress from '#models/user_address'
import AuthCode from '#models/auth_code'
import {
  siweVerifyValidator,
  emailRequestValidator,
  emailVerifyValidator,
} from '#validators/auth'
import { HttpError } from '#exceptions/http_error'
import { issueTokenFor } from '#services/auth_token'
import { newNonce, verifySiweSignature } from '#services/siwe'
import { serialize } from '#services/serializer'
import UserTransformer from '#transformers/user_transformer'
import { BEARER_COOKIE } from '#middleware/cookie_token_middleware'
import AuthPinMail from '#mailers/auth/pin'

export default class AuthController {
  // ---------- SIWE ----------

  async nonce({ session }: HttpContext) {
    const nonce = newNonce()
    session.put('siwe_nonce', nonce)
    return { nonce }
  }

  async siweVerify(ctx: HttpContext) {
    const { request, session, auth } = ctx
    const { message, signature } = await request.validateUsing(siweVerifyValidator)
    const address = await verifySiweSignature(session, message, signature)

    const user = await db.transaction(async (trx) => {
      const authedUser = await auth.check().then(() => auth.user)

      const existingAddress = await UserAddress.query({ client: trx })
        .where('address', address)
        .first()

      if (existingAddress && authedUser && existingAddress.userId !== authedUser.id) {
        throw new HttpError(409, 'Address already linked to a different account')
      }

      if (existingAddress) {
        existingAddress.useTransaction(trx)
        existingAddress.verificationMessage = message
        existingAddress.verificationSignature = signature
        existingAddress.verifiedAt = DateTime.now()
        await existingAddress.save()
        return User.query({ client: trx }).where('id', existingAddress.userId).firstOrFail()
      }

      const owner = authedUser ?? (await User.create({}, { client: trx }))
      owner.useTransaction(trx)

      const priorAddresses = await UserAddress.query({ client: trx })
        .where('userId', owner.id)
        .count('* as count')
        .first()
      const isFirst = Number(priorAddresses?.$extras.count ?? 0) === 0

      await UserAddress.create(
        {
          userId: owner.id,
          address,
          verificationMessage: message,
          verificationSignature: signature,
          verifiedAt: DateTime.now(),
          isPrimary: isFirst,
        },
        { client: trx }
      )

      return owner
    })

    return issueTokenFor(ctx, user, 'siwe')
  }

  // ---------- Email PIN ----------

  async emailRequest({ request, auth }: HttpContext) {
    const { email } = await request.validateUsing(emailRequestValidator)
    await auth.check()
    const authedUser = auth.user

    const user = await db.transaction(async (trx) => {
      const owner = await User.query({ client: trx }).where('email', email).first()
      if (owner) {
        if (authedUser && authedUser.id !== owner.id) {
          throw new HttpError(409, 'Email already linked to a different account')
        }
        return owner
      }
      if (authedUser) {
        authedUser.useTransaction(trx)
        authedUser.email = email
        authedUser.emailVerifiedAt = null
        await authedUser.save()
        return authedUser
      }
      return User.create({ email }, { client: trx })
    })

    const authCode = await AuthCode.newFor(user, 'email')

    await mail.send(new AuthPinMail({ email, code: authCode.code }))

    return { ok: true, expires_at: authCode.expiresAt }
  }

  async emailVerify(ctx: HttpContext) {
    const { request } = ctx
    const { email, code } = await request.validateUsing(emailVerifyValidator)

    const user = await User.query().where('email', email).first()
    if (!user) throw new HttpError(401, 'Invalid code')

    const authCode = await AuthCode.find(user.id)
    if (!authCode || !authCode.isValid(code)) throw new HttpError(401, 'Invalid or expired code')

    await db.transaction(async (trx) => {
      authCode.useTransaction(trx)
      user.useTransaction(trx)
      await authCode.consume()
      await user.markEmailVerified()
    })

    return issueTokenFor(ctx, user, 'email')
  }

  // ---------- Session ----------

  async me({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    await user.load('addresses')
    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  async signOut({ auth, response }: HttpContext) {
    const user = auth.user
    if (user && user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }
    response.clearCookie(BEARER_COOKIE)
    return { ok: true }
  }
}
