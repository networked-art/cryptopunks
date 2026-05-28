import vine from '@vinejs/vine'

const ACTIVITY_SOURCES = [
  'cryptopunks_v2',
  'wrapped_punks',
  'cryptopunks_721',
  'punks_auction',
] as const

const ACTIVITY_KINDS = [
  'listing',
  'lot_created',
  'auction_started',
  'bid',
  'sale',
  'auction_settled',
  'offer_placed',
] as const

export const createSearchValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    criteria: vine.any(),
    notify: vine.boolean().optional(),
    notifyFrequency: vine.enum(['immediate', 'hourly', 'daily'] as const).optional(),
    notifySources: vine.array(vine.enum(ACTIVITY_SOURCES)).minLength(1).optional(),
    notifyKinds: vine.array(vine.enum(ACTIVITY_KINDS)).minLength(1).optional(),
    maxPriceWei: vine.string().regex(/^\d+$/).maxLength(80).nullable().optional(),
  })
)

export const updateSearchValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120).optional(),
    criteria: vine.any().optional(),
    notify: vine.boolean().optional(),
    notifyFrequency: vine.enum(['immediate', 'hourly', 'daily'] as const).optional(),
    notifySources: vine.array(vine.enum(ACTIVITY_SOURCES)).minLength(1).optional(),
    notifyKinds: vine.array(vine.enum(ACTIVITY_KINDS)).minLength(1).optional(),
    maxPriceWei: vine.string().regex(/^\d+$/).maxLength(80).nullable().optional(),
  })
)
