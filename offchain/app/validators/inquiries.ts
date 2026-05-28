import vine from '@vinejs/vine'

export const createInquiryValidator = vine.compile(
  vine.object({
    searchId: vine.number().positive(),
    note: vine.string().trim().maxLength(2000).nullable().optional(),
    maxPriceWei: vine.string().regex(/^\d+$/).maxLength(80).nullable().optional(),
  })
)

export const updateInquiryValidator = vine.compile(
  vine.object({
    note: vine.string().trim().maxLength(2000).nullable().optional(),
    maxPriceWei: vine.string().regex(/^\d+$/).maxLength(80).nullable().optional(),
  })
)

export const adminUpdateInquiryValidator = vine.compile(
  vine.object({
    status: vine.enum(['open', 'contacted', 'fulfilled', 'cancelled'] as const),
  })
)
