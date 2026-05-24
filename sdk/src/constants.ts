import type { Address, Hex } from 'viem'

export const PUNKS_DATA_ENS = 'punksdata.eth'
export const PUNKS_DATA_ADDRESS =
  '0x9cF9C8eA737A7d5157d3F4282aCe30880a7A117C' as Address
export const PUNKS_DATA_DATASET_HASH =
  '0x92117ce6cb6bb70f9ffb9bf51ebbca6a84eae10e70639295d9c4a07958cd1f68' as Hex
export const PUNKS_RENDERER_ENS = 'renderer.punksdata.eth'
export const PUNKS_RENDERER_ADDRESS =
  '0x0955B58e38fA8794723AC7B5Ac99d2Df67D55741' as Address
export const CRYPTOPUNKS_MARKET_ADDRESS =
  '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb' as Address
/// The bug-aware Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ market (deployed 2017-06-22).
export const CRYPTOPUNKS_V1_ADDRESS =
  '0x6ba6f2207e343923ba692e5cae646fb0f566db8d' as Address
export const CRYPTOPUNKS_DATA_ADDRESS =
  '0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2' as Address
export const WRAPPED_PUNKS_ADDRESS =
  '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6' as Address
export const CRYPTOPUNKS_721_ADDRESS =
  '0x000000000000003607fce1ac9e043a86675c5c2f' as Address
export const STASH_FACTORY_ADDRESS =
  '0x000000000000a6fa31f5fc51c1640aac76866750' as Address
/// `PunksVaultFactory` — deploys deterministic per-user `PunksVault` clones.
/// `predictVault(user)` is a pure view and safe to read at any block ≥
/// `PUNKS_VAULT_FACTORY_START_BLOCK`.
export const PUNKS_VAULT_FACTORY_ADDRESS =
  '0xf3381B259B2FE142c0A87bffF463695d935D6F66' as Address
export const PUNKS_VAULT_FACTORY_START_BLOCK = 25_103_673n
// The V1-aware PunksMarket contract. ENS-resolvable; the literal address is
// the zero address as a placeholder until the contract is deployed and the
// constant can be filled in. Consumers should pass `address` explicitly to the
// client constructor until then.
export const PUNKS_V1_MARKET_ENS = 'punksmarket.eth'
export const PUNKS_V1_MARKET_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Address
/// Third-party ERC-721 wrapper that custodies the broken June 9th 2017
/// Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ one-to-one. Wrapping moves the underlying Punk into this
/// contract and mints the matching token; unwrapping burns it and releases
/// the Punk to the caller.
export const PUNKS_V1_WRAPPER_ADDRESS =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as Address
/// Stateless `UnwrapV1Punks` batch helper at `unwrap.punksmarket.eth`. The
/// wrapper has no native batch-unwrap, so this helper pulls each wrapper
/// token from the caller, calls `unwrap`, and forwards the underlying Punk
/// to the caller. Callers must first
/// `setApprovalForAll(UNWRAP_V1_PUNKS_ADDRESS, true)` on the V1 wrapper.
export const UNWRAP_V1_PUNKS_ENS = 'unwrap.punksmarket.eth'
export const UNWRAP_V1_PUNKS_ADDRESS =
  '0x6D263B22D1b2fEb93881AF6ff57666EfA5A8F346' as Address
export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Address

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

export const punkTypeNames = [
  'Alien',
  'Ape',
  'Female',
  'Male',
  'Zombie',
] as const

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

export const PunkStandard = {
  CryptoPunks: 0,
  CryptoPunksV1: 1,
} as const

export const traitKindNames = [
  'HeadVariant',
  'NormalizedType',
  'AttributeCount',
  'Accessory',
] as const

/// Skin tones for human Punks. The four human head-variant slots (Female 1..4
/// and Male 1..4) are ordered Dark → Brown → Fair → Albino, matching the
/// rarity ladder in the source CSV. Aliens, Apes, and Zombies do not have a
/// skin tone — filters that restrict by skin tone implicitly restrict to
/// humans.
export const SkinTone = {
  Dark: 0,
  Brown: 1,
  Fair: 2,
  Albino: 3,
} as const

export const skinToneNames = ['Dark', 'Brown', 'Fair', 'Albino'] as const

/// Head variants for each skin tone, ordered [Female, Male].
export const skinToneHeadVariants = [
  [HeadVariant.Female1, HeadVariant.Male1],
  [HeadVariant.Female2, HeadVariant.Male2],
  [HeadVariant.Female3, HeadVariant.Male3],
  [HeadVariant.Female4, HeadVariant.Male4],
] as const

export type PunkTypeValue = (typeof PunkType)[keyof typeof PunkType]
export type PunkTypeName = (typeof punkTypeNames)[number]
export type HeadVariantValue = (typeof HeadVariant)[keyof typeof HeadVariant]
export type HeadVariantName = (typeof headVariantNames)[number]
export type TraitKindValue = (typeof TraitKind)[keyof typeof TraitKind]
export type TraitKindName = (typeof traitKindNames)[number]
export type PunkStandardValue = (typeof PunkStandard)[keyof typeof PunkStandard]
export type SkinToneValue = (typeof SkinTone)[keyof typeof SkinTone]
export type SkinToneName = (typeof skinToneNames)[number]
