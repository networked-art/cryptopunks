import type { Address, Hex, PublicClient } from 'viem'
import type {
  HeadVariantName,
  HeadVariantValue,
  PunkTypeName,
  PunkTypeValue,
  TraitKindName,
  TraitKindValue,
} from './constants'

export type PunksDataBlockTag = 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'

export type PunksDataReadOptions = {
  blockNumber?: bigint
  blockTag?: PunksDataBlockTag
  cache?: boolean
}

export type PunksDataClientConfig = {
  publicClient: PublicClient
  address?: Address
  cache?: boolean
  multicallBatchSize?: number
}

export type TraitKindInput = TraitKindValue | TraitKindName
export type TraitRef =
  | number
  | string
  | {
      id?: number
      name?: string
      kind?: TraitKindInput
    }

export type ColorRef = number | Hex | `#${string}` | string

export type TraitRecord = {
  id: number
  name: string
  kind: TraitKindValue
  kindName: TraitKindName
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

export type PunksSearchQuery = {
  traits?: TraitCriteriaInput
  colors?: ColorCriteriaInput
  pixelCount?: NumericRange
  colorCount?: NumericRange
  ids?: Iterable<number>
  excludeIds?: Iterable<number>
  offset?: number
  limit?: number
}

export type PunkBitmap = bigint[]

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

export type DatasetStatus = {
  isSealed: boolean
  datasetHash: Hex
}
