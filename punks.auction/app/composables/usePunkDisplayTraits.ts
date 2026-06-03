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

const KIND_ORDER = new Map<string, number>([
  ['Type', 0],
  ['Skin', 1],
  ['Attributes', 99],
])

function kindSortKey(kind: string) {
  return KIND_ORDER.get(kind) ?? 50
}

function parseAttributeCountName(name: string) {
  const match = name.match(/^(\d+) Attributes$/)
  return match ? Number(match[1]) : null
}

export function usePunkDisplayTraits(summary: MaybeRefOrGetter<PunkSummary>) {
  const displayTraits = computed<PunkDisplayTrait[]>(() => {
    const rows = (toValue(summary).traits ?? []).flatMap(
      (t): PunkDisplayTrait[] => {
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
          const count = parseAttributeCountName(t.name)
          if (count === null) {
            return [
              { ...t, kind: 'Attributes', query: quoteIfMultiword(t.name) },
            ]
          }
          const word = count === 1 ? 'Attribute' : 'Attributes'
          return [
            {
              ...t,
              kind: 'Attributes',
              name: `${count} ${word}`,
              query: `${count} ${word.toLowerCase()}`,
            },
          ]
        }
        return [{ ...t, query: quoteIfMultiword(t.name) }]
      },
    )
    return rows.sort((a, b) => kindSortKey(a.kind) - kindSortKey(b.kind))
  })

  return { displayTraits }
}
