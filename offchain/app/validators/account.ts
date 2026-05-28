import vine from '@vinejs/vine'

export const addEmailValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
  })
)

export const addEmailVerifyValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail(),
    code: vine.number().min(100_000).max(999_999),
  })
)

export const addAddressValidator = vine.compile(
  vine.object({
    message: vine.string(),
    signature: vine.string(),
  })
)

export const settingsUpdateValidator = vine.compile(
  vine.object({
    emailEnabled: vine.boolean().optional(),
    digestFrequency: vine.enum(['immediate', 'hourly', 'daily', 'off'] as const).optional(),
    quietHoursStart: vine.number().min(0).max(23).nullable().optional(),
    quietHoursEnd: vine.number().min(0).max(23).nullable().optional(),
    displayName: vine.string().trim().minLength(1).maxLength(100).nullable().optional(),
  })
)
