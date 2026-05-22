import {
  headVariantNames,
  skinToneHeadVariants,
  skinToneNames,
  type HeadVariantName,
  type PunkSummary,
  type SkinToneName,
} from '@networked-art/punks-sdk'
import { quoteIfMultiword } from '~/utils/punkSearch'

export type PunkDisplayTrait = {
  id: number
  kind: string
  name: string
  supply: number
  query: string
}

export type PunkSkinTag = {
  label: string
  query: string
}

const HIDDEN_KINDS = new Set(['Skin', 'Type', 'Attributes'])
const skinToneByHeadVariant: Partial<Record<HeadVariantName, SkinToneName>> =
  (() => {
    const map: Partial<Record<HeadVariantName, SkinToneName>> = {}
    skinToneHeadVariants.forEach((pair, tone) => {
      for (const hv of pair) {
        map[headVariantNames[hv]] = skinToneNames[tone]
      }
    })
    return map
  })()

export function usePunkDisplayTraits(summary: MaybeRefOrGetter<PunkSummary>) {
  const displayTraits = computed<PunkDisplayTrait[]>(() =>
    (toValue(summary).traits ?? []).flatMap((t): PunkDisplayTrait[] => {
      if (t.kind === 'HeadVariant') {
        const tone = skinToneByHeadVariant[t.name as HeadVariantName]
        if (!tone) return []
        return [
          {
            ...t,
            kind: 'Skin',
            name: tone,
            query: `${tone.toLowerCase()} skin`,
          },
        ]
      }
      if (t.kind === 'NormalizedType') {
        return [{ ...t, kind: 'Type', query: quoteIfMultiword(t.name) }]
      }
      if (t.kind === 'AttributeCount') {
        return [{ ...t, kind: 'Attributes', query: quoteIfMultiword(t.name) }]
      }
      return [{ ...t, query: quoteIfMultiword(t.name) }]
    }),
  )

  const visibleTraits = computed(() =>
    displayTraits.value.filter((t) => !HIDDEN_KINDS.has(t.kind)),
  )

  const skinTag = computed<PunkSkinTag | null>(() => {
    const tone = skinToneByHeadVariant[toValue(summary).headVariantName]
    if (!tone) return null
    return { label: `${tone} Skin`, query: `${tone.toLowerCase()} skin` }
  })

  return { skinTag, visibleTraits }
}
