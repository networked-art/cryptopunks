import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { isAddress } from 'viem'
import User from '#models/user'
import UserAddress from '#models/user_address'
import AuthCode from '#models/auth_code'
import { HttpError } from '#exceptions/http_error'
import { verifySiweSignature } from '#services/siwe'
import { serialize } from '#services/serializer'
import UserTransformer from '#transformers/user_transformer'
import {
  addAddressValidator,
  addEmailValidator,
  addEmailVerifyValidator,
  settingsUpdateValidator,
} from '#validators/account'
import AuthPinMail from '#mailers/auth/pin'

export default class AccountController {
  // ---------- Email linkage ----------

  async requestEmail({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const { email } = await request.validateUsing(addEmailValidator)

    const conflict = await User.query().where('email', email).whereNot('id', user.id).first()
    if (conflict) throw new HttpError(409, 'Email already linked to a different account')

    user.email = email
    user.emailVerifiedAt = null
    await user.save()

    const authCode = await AuthCode.newFor(user, 'email')
    await mail.send(new AuthPinMail({ email, code: authCode.code }))

    return { ok: true, expires_at: authCode.expiresAt }
  }

  async verifyEmail({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const { email, code } = await request.validateUsing(addEmailVerifyValidator)

    if (user.email !== email) throw new HttpError(400, 'Email mismatch')

    const authCode = await AuthCode.find(user.id)
    if (!authCode || !authCode.isValid(code)) throw new HttpError(401, 'Invalid or expired code')

    await db.transaction(async (trx) => {
      authCode.useTransaction(trx)
      user.useTransaction(trx)
      await authCode.consume()
      await user.markEmailVerified()
    })

    await user.load('addresses')
    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  async removeEmail({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    await user.load('addresses')

    if (user.addresses.length === 0) {
      throw new HttpError(400, 'Cannot remove the only identifier; link a wallet first')
    }

    user.email = null
    user.emailVerifiedAt = null
    await user.save()

    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  // ---------- Address linkage ----------

  async addAddress(ctx: HttpContext) {
    const { request, session, auth } = ctx
    const user = auth.getUserOrFail()
    const { message, signature } = await request.validateUsing(addAddressValidator)
    const address = await verifySiweSignature(session, message, signature)

    await db.transaction(async (trx) => {
      const existing = await UserAddress.query({ client: trx }).where('address', address).first()
      if (existing && existing.userId !== user.id) {
        throw new HttpError(409, 'Address already linked to a different account')
      }
      if (existing) {
        existing.useTransaction(trx)
        existing.verificationMessage = message
        existing.verificationSignature = signature
        existing.verifiedAt = DateTime.now()
        await existing.save()
        return
      }

      const priorCount = await UserAddress.query({ client: trx })
        .where('userId', user.id)
        .count('* as count')
        .first()
      const isFirst = Number(priorCount?.$extras.count ?? 0) === 0

      await UserAddress.create(
        {
          userId: user.id,
          address,
          verificationMessage: message,
          verificationSignature: signature,
          verifiedAt: DateTime.now(),
          isPrimary: isFirst,
        },
        { client: trx }
      )
    })

    await user.load('addresses')
    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  async removeAddress({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const target = (params.address as string).toLowerCase()
    if (!isAddress(target)) throw new HttpError(400, 'Invalid address')

    await user.load('addresses')

    const row = user.addresses.find((a) => a.address === target)
    if (!row) throw new HttpError(404, 'Address not found')

    const remainingIdentifiers =
      user.addresses.filter((a) => a.address !== target).length + (user.email ? 1 : 0)
    if (remainingIdentifiers === 0) {
      throw new HttpError(400, 'Cannot remove the only identifier; link an email or another wallet first')
    }

    await db.transaction(async (trx) => {
      row.useTransaction(trx)
      await row.delete()

      if (row.isPrimary) {
        const next = await UserAddress.query({ client: trx })
          .where('userId', user.id)
          .orderBy('createdAt', 'asc')
          .first()
        if (next) {
          next.useTransaction(trx)
          next.isPrimary = true
          await next.save()
        }
      }
    })

    await user.load('addresses')
    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  async setPrimaryAddress({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const target = (params.address as string).toLowerCase()
    if (!isAddress(target)) throw new HttpError(400, 'Invalid address')

    await user.load('addresses')
    const row = user.addresses.find((a) => a.address === target)
    if (!row) throw new HttpError(404, 'Address not found')

    await db.transaction(async (trx) => {
      await UserAddress.query({ client: trx })
        .where('userId', user.id)
        .where('isPrimary', true)
        .update({ isPrimary: false })

      row.useTransaction(trx)
      row.isPrimary = true
      await row.save()
    })

    await user.load('addresses')
    return serialize({ user: UserTransformer.transform(user).useVariant('forSelf') })
  }

  // ---------- Settings ----------

  async getSettings({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    return serialize({ settings: user.settings, display_name: user.displayName })
  }

  async updateSettings({ request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(settingsUpdateValidator)

    const next = { ...user.settings }
    if (data.emailEnabled !== undefined) next.emailEnabled = data.emailEnabled
    if (data.digestFrequency !== undefined) next.digestFrequency = data.digestFrequency
    if (data.quietHoursStart !== undefined) next.quietHoursStart = data.quietHoursStart
    if (data.quietHoursEnd !== undefined) next.quietHoursEnd = data.quietHoursEnd
    user.settings = next

    if (data.displayName !== undefined) user.displayName = data.displayName

    await user.save()
    return serialize({ settings: user.settings, display_name: user.displayName })
  }
}
