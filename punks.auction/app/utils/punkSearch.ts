import {
  addressForLabel,
  type PunksSdk,
} from '@networked-art/punks-sdk'
import { isAddress } from 'viem'

const LISTED_QUALIFIER =
  /(^|[\s,])(?:for\s+sale|on\s+sale|list(?:ed|ing|ings)?|sale)(?=$|[\s,])/gi
const BID_QUALIFIER =
  /(^|[\s,])(?:has\s+bids?|with\s+bids?|active\s+bids?|bids?)(?=$|[\s,])/gi
const WRAPPED_WORD = 'wrap(?:ped|per)?'
const LEGACY_WRAPPER_SYNONYM = 'wrapped[_\\s-]*punks'
const MODERN_WRAPPER_SYNONYM = '(?:erc[-\\s]?721|cryptopunks\\s*721)'
const LEGACY_WRAPPED_WORD = `(?:${WRAPPED_WORD}|${LEGACY_WRAPPER_SYNONYM})`
const MODERN_WRAPPED_WORD = `(?:${WRAPPED_WORD}|${MODERN_WRAPPER_SYNONYM})`
const LEGACY_WRAPPED_QUALIFIER = qualifierPattern(
  `(?:legacy\\s+${LEGACY_WRAPPED_WORD}|${LEGACY_WRAPPED_WORD}\\s+legacy|${LEGACY_WRAPPER_SYNONYM})`,
)
const MODERN_WRAPPED_QUALIFIER = qualifierPattern(
  `(?:modern\\s+${MODERN_WRAPPED_WORD}|${MODERN_WRAPPED_WORD}\\s+modern|${MODERN_WRAPPER_SYNONYM})`,
)
const WRAPPED_QUALIFIER = qualifierPattern(WRAPPED_WORD)
const ENS_HANDLE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i
const HEX_COLOR_TOKEN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g

export type PunkSearchQualifiers = {
  text: string
  listed: boolean
  activeBids: boolean
  wrapped: boolean
  legacyWrapped: boolean
  modernWrapped: boolean
}

export function punkSearchHref(text: string) {
  return { path: '/punks', query: { q: text } }
}

export function quoteIfMultiword(text: string) {
  return /\s/.test(text) ? `"${text}"` : text
}

export function extractPunkSearchQualifiers(
  input: string,
  options: { enableMarketQualifiers?: boolean } = {},
): PunkSearchQualifiers {
  let listed = false
  let activeBids = false
  let wrapped = false
  let legacyWrapped = false
  let modernWrapped = false

  const cleaned =
    options.enableMarketQualifiers === false
      ? input
      : input
          .replace(LEGACY_WRAPPED_QUALIFIER, (_match, prefix: string) => {
            legacyWrapped = true
            return prefix || ''
          })
          .replace(MODERN_WRAPPED_QUALIFIER, (_match, prefix: string) => {
            modernWrapped = true
            return prefix || ''
          })
          .replace(LISTED_QUALIFIER, (_match, prefix: string) => {
            listed = true
            return prefix || ''
          })
          .replace(BID_QUALIFIER, (_match, prefix: string) => {
            activeBids = true
            return prefix || ''
          })
          .replace(WRAPPED_QUALIFIER, (_match, prefix: string) => {
            wrapped = true
            return prefix || ''
          })

  return {
    text: normalizeQualifierText(cleaned),
    listed,
    activeBids,
    wrapped,
    legacyWrapped,
    modernWrapped,
  }
}

export function parsePunkSearchText(raw: string) {
  if (!raw) return { text: undefined, colors: undefined }
  const colors = raw.match(HEX_COLOR_TOKEN)
  const remaining = raw.replace(HEX_COLOR_TOKEN, ' ').replace(/\s+/g, ' ').trim()
  return {
    text: remaining || undefined,
    colors: colors?.length ? colors : undefined,
  }
}

export function resolvePunkSearchOwnerHandle(
  input: string,
  sdk: PunksSdk,
): string | null {
  const direct = detectOwnerHandle(input)
  if (direct) return direct

  const value = input.trim()
  if (!value || punkSearchResolvesToCollection(value, sdk)) return null
  return addressForLabel(value) ?? null
}

export function punkSearchResolvesToCollection(
  input: string,
  sdk: PunksSdk,
): boolean {
  const value = input.trim()
  if (!value) return false
  const completed = sdk.dataset.completeSearchText(value)
  return sdk.collections.matches(completed).length > 0
}

export function intersectIds(
  baseIds: Iterable<number> | undefined,
  filterIds: Iterable<number>,
) {
  if (!baseIds) return Array.from(filterIds)
  const filter = new Set(filterIds)
  return Array.from(baseIds).filter((id) => filter.has(id))
}

export function unionIds(...groups: Iterable<number>[]) {
  return new Set(groups.flatMap((group) => Array.from(group)))
}

function qualifierPattern(source: string): RegExp {
  return new RegExp(`(^|[\\s,])${source}(?=$|[\\s,])`, 'gi')
}

function normalizeQualifierText(input: string) {
  return input
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectOwnerHandle(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (isAddress(value)) return value
  if (ENS_HANDLE.test(value) && /\.eth$/i.test(value)) return value
  return null
}
