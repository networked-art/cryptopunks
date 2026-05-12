import type { Address, Hex, PublicClient } from 'viem'
import type {
  HeadVariantName,
  HeadVariantValue,
  PunkTypeName,
  PunkTypeValue,
  TraitKindValue,
  TraitKindName,
} from './constants'

export type PunksDataBlockTag = 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'

export type PunksDataReadOptions = {
  blockNumber?: bigint
  blockTag?: PunksDataBlockTag
  cache?: boolean
}

export type PunksDataClientConfig = {
  publicClient?: PublicClient
  address?: Address
  cache?: boolean
  multicallBatchSize?: number
}

export type PunksRendererReadOptions = PunksDataReadOptions

export type PunksRendererClientConfig = {
  publicClient: PublicClient
  address?: Address
  cache?: boolean
}

export type TraitRef =
  | number
  | string
  | {
      id?: number
      name?: string
    }

export type AttributeRef = TraitRef

export type ColorRef = number | Hex | `#${string}` | string

export type TraitRecord = {
  id: number
  name: string
  kind: TraitKindName
  kindId: TraitKindValue
  supply: number
}

export type PaletteColor = {
  id: number
  rgba: Hex
  rgb: Hex
  alpha: number
  r: number
  g: number
  b: number
  a: number
  supply?: number
}

export type TraitCriteriaInput = {
  required?: readonly TraitRef[]
  forbidden?: readonly TraitRef[]
  anyOf?: readonly TraitRef[]
  requiredMask?: bigint
  forbiddenMask?: bigint
  anyOfMask?: bigint
}

export type AttributeCriteriaInput = {
  required?: readonly AttributeRef[]
  forbidden?: readonly AttributeRef[]
  anyOf?: readonly AttributeRef[]
  requiredMask?: bigint
  forbiddenMask?: bigint
  anyOfMask?: bigint
}

export type ResolvedTraitCriteria = {
  requiredMask: bigint
  forbiddenMask: bigint
  anyOfMask: bigint
}

export type ColorCriteriaInput = {
  required?: readonly ColorRef[]
  forbidden?: readonly ColorRef[]
  anyOf?: readonly ColorRef[]
  requiredMask?: bigint
  forbiddenMask?: bigint
  anyOfMask?: bigint
}

export type ResolvedColorCriteria = {
  requiredMask: bigint
  forbiddenMask: bigint
  anyOfMask: bigint
}

export type NumericRange = number | {
  eq?: number
  min?: number
  max?: number
}

export type PunkQuerySort =
  | 'id'
  | 'id-desc'
  | 'rarity'
  | 'rarity-desc'
  | 'pixelCount'
  | 'pixelCount-desc'
  | 'colorCount'
  | 'colorCount-desc'
  | 'attributeCount'
  | 'attributeCount-desc'

export type PunksSearchQuery = {
  attributes?: AttributeCriteriaInput
  colors?: ColorCriteriaInput
  pixelCount?: NumericRange
  colorCount?: NumericRange
  ids?: Iterable<number>
  excludeIds?: Iterable<number>
  offset?: number
  limit?: number
}

export type PunkQuery = PunksSearchQuery & {
  text?: string
  type?: PunkTypeValue | PunkTypeName | string | readonly (PunkTypeValue | PunkTypeName | string)[]
  punkType?: PunkTypeValue | PunkTypeName | string | readonly (PunkTypeValue | PunkTypeName | string)[]
  head?: HeadVariantValue | HeadVariantName | string | readonly (HeadVariantValue | HeadVariantName | string)[]
  headVariant?: HeadVariantValue | HeadVariantName | string | readonly (HeadVariantValue | HeadVariantName | string)[]
  attributeCount?: NumericRange
  sort?: PunkQuerySort
}

export type PunkBitmap = Uint32Array

export type BitmapToPunkIdsOptions = {
  offset?: number
  limit?: number
  minId?: number
  maxId?: number
}

export type PunkSummaryOptions = {
  includeTraits?: boolean
  includeColors?: boolean
  includePixels?: boolean
}

export type PunkSummary = {
  id: number
  traitMask: bigint
  colorMask: bigint
  traitIds: number[]
  colorIds: number[]
  pixelCount: number
  colorCount: number
  attributeCount: number
  punkType: PunkTypeValue
  punkTypeName: PunkTypeName
  headVariant: HeadVariantValue
  headVariantName: HeadVariantName
  traits?: TraitRecord[]
  colors?: PaletteColor[]
  indexedPixels?: Uint8Array
}

export type PunkMetadataAttribute = {
  trait_type: string
  value: string | number
  display_type?: string
}

export type PunkMetadata = {
  name: string
  description: string
  image: string
  attributes: PunkMetadataAttribute[]
  colors: string[]
  [key: string]: unknown
}
