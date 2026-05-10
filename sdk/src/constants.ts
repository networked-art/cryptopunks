import type { Address, Hex } from 'viem'

export const PUNKS_DATA_ENS = 'punksdata.eth'
export const PUNKS_DATA_ADDRESS =
  '0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C' as Address
export const PUNKS_RENDERER_ENS = 'renderer.punksdata.eth'
export const PUNKS_RENDERER_ADDRESS =
  '0x0955B58e38fA8794723AC7B5Ac99d2Df67D55741' as Address

export const PUNKS_RENDERER_BACKGROUND_DEFAULT = '0x638596ff' as Hex
export const PUNKS_RENDERER_BACKGROUND_FOR_SALE = '0x8c5851ff' as Hex
export const PUNKS_RENDERER_BACKGROUND_BID = '0x8970b1ff' as Hex
export const PUNKS_RENDERER_BACKGROUND_WRAPPED = '0x66a670ff' as Hex
export const PUNKS_RENDERER_BACKGROUND_C721_WRAPPED = '0x75a475ff' as Hex

export const PUNK_COUNT = 10_000
export const PUNK_WIDTH = 24
export const PUNK_HEIGHT = 24
export const PIXELS_PER_PUNK = PUNK_WIDTH * PUNK_HEIGHT

export const TRAIT_COUNT = 111
export const PALETTE_SIZE = 222
export const BITMAP_WORD_COUNT = 40
export const PUNKS_PER_BITMAP_WORD = 256

export const PIXEL_COUNT_MIN = 148
export const PIXEL_COUNT_MAX = 332
export const COLOR_COUNT_MIN = 2
export const COLOR_COUNT_MAX = 14

export const FULL_BITMAP_WORD = (1n << 256n) - 1n
export const LAST_BITMAP_WORD_BITS =
  PUNK_COUNT - (BITMAP_WORD_COUNT - 1) * PUNKS_PER_BITMAP_WORD
export const LAST_BITMAP_WORD_MASK = (1n << BigInt(LAST_BITMAP_WORD_BITS)) - 1n
export const CANONICAL_TRAIT_MASK = (1n << BigInt(TRAIT_COUNT)) - 1n
export const CANONICAL_COLOR_MASK = (1n << BigInt(PALETTE_SIZE)) - 1n

export const PunkType = {
  Alien: 0,
  Ape: 1,
  Female: 2,
  Male: 3,
  Zombie: 4,
} as const

export const punkTypeNames = ['Alien', 'Ape', 'Female', 'Male', 'Zombie'] as const

export const HeadVariant = {
  Alien: 0,
  Ape: 1,
  Female1: 2,
  Female2: 3,
  Female3: 4,
  Female4: 5,
  Male1: 6,
  Male2: 7,
  Male3: 8,
  Male4: 9,
  Zombie: 10,
} as const

export const headVariantNames = [
  'Alien',
  'Ape',
  'Female 1',
  'Female 2',
  'Female 3',
  'Female 4',
  'Male 1',
  'Male 2',
  'Male 3',
  'Male 4',
  'Zombie',
] as const

export const TraitKind = {
  HeadVariant: 0,
  NormalizedType: 1,
  AttributeCount: 2,
  Accessory: 3,
} as const

export const traitKindNames = [
  'HeadVariant',
  'NormalizedType',
  'AttributeCount',
  'Accessory',
] as const

export type PunkTypeValue = (typeof PunkType)[keyof typeof PunkType]
export type PunkTypeName = (typeof punkTypeNames)[number]
export type HeadVariantValue = (typeof HeadVariant)[keyof typeof HeadVariant]
export type HeadVariantName = (typeof headVariantNames)[number]
export type TraitKindValue = (typeof TraitKind)[keyof typeof TraitKind]
export type TraitKindName = (typeof traitKindNames)[number]
