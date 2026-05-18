export function isLiveListingOwner(
  seller?: string | null,
  owner?: string | null,
) {
  return !!seller && !!owner && seller.toLowerCase() === owner.toLowerCase()
}
