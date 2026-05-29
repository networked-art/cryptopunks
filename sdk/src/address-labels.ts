import type { Address } from 'viem'
import { searchCollections } from './collections'
import { normalizeSynonymText } from './utils'

/// A curated, non-ENS label for a well-known address. `short` is the compact
/// form for badges and inline display (e.g. `NODE`); `name` is the full name
/// for headings and tooltips (e.g. `NODE FOUNDATION`).
export interface AddressLabel {
  short: string
  name: string
}

interface LabeledAddress {
  address: Address
  label: AddressLabel
}

/// Hand-curated labels for notable non-institution addresses. Addresses are
/// checksummed for verifiability; lookups normalize them. Institutions are not
/// listed here — they derive their label from the curated collections below.
const curatedEntries: readonly LabeledAddress[] = [
  {
    address: '0x0c5Ca6bE6fF0Cd69F4fF9e29df639a0806aea91E',
    label: { short: 'NODE', name: 'NODE FOUNDATION' },
  },
  {
    address: '0xa858ddc0445d8131dac4d1de01f834ffcba52ef1',
    label: { short: 'YUGA', name: 'YUGALABS' },
  },
]

/// Labels from curated-collection institutions that declare a holding `address`
/// — the institution is the single source of truth for its name, so a museum's
/// wallet renders the same identity its Punk pages already attribute. `name` is
/// the institution `title`; `short` is its `short` field, or the slug uppercased.
function institutionEntries(): LabeledAddress[] {
  const entries: LabeledAddress[] = []
  for (const collection of searchCollections) {
    for (const institution of collection.institutions ?? []) {
      if (institution.address === undefined) continue
      entries.push({
        address: institution.address,
        label: {
          short: institution.short ?? institution.slug.toUpperCase(),
          name: institution.title,
        },
      })
    }
  }
  return entries
}

/// Curated entries last so they win over institution-derived ones for the rare
/// address (or normalized label) that appears in both — later `Map` sets and
/// later `byLabel` assignments overwrite earlier ones.
const entries: readonly LabeledAddress[] = [
  ...institutionEntries(),
  ...curatedEntries,
]

const byAddress = new Map<string, AddressLabel>(
  entries.map(({ address, label }) => [address.toLowerCase(), label]),
)

const byLabel = new Map<string, Address>()
for (const { address, label } of entries) {
  for (const form of [label.short, label.name]) {
    const key = normalizeSynonymText(form)
    if (key) byLabel.set(key, address)
  }
}

/// The curated label for `address`, or `undefined` when none is known. Takes
/// precedence over ENS at the display layer.
export function addressLabel(
  address: string | null | undefined,
): AddressLabel | undefined {
  if (!address) return undefined
  return byAddress.get(address.toLowerCase())
}

/// The address a curated label resolves to, matching either form (e.g. `NODE`
/// or `NODE FOUNDATION`) case- and punctuation-insensitively, or `undefined`.
/// The reverse of `addressLabel`, for resolving a typed label to an account.
export function addressForLabel(
  text: string | null | undefined,
): Address | undefined {
  if (!text) return undefined
  return byLabel.get(normalizeSynonymText(text))
}
