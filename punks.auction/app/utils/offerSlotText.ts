import { titleCase } from '@networked-art/punks-sdk'

export const OFFER_SLOT_TEXT = {
  specificPunk: 'Specific Punk',
  selectionOrTraitOffer: 'Selection or Trait Offer',
  collectionOffer: 'Collection Offer',
  traitOffer: 'Trait Offer',
  traitGroup: 'Trait Group',
  selectionOffer: 'Selection Offer',
} as const

export function formatOfferTraitTitle(title: string) {
  return titleCase(title)
    .replace(/\bOr\b/g, 'or')
    .replace(/\b3d\b/gi, '3D')
}
