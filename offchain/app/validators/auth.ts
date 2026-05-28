import vine from '@vinejs/vine'

export const siweVerifyValidator = vine.compile(
  vine.object({
    message: vine.string(),
    signature: vine.string(),
  })
)

export const emailRequestValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
  })
)

export const emailVerifyValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
    code: vine.number().min(100_000).max(999_999),
  })
)
