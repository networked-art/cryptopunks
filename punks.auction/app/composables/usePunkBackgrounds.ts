import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import { PUNK_BACKGROUNDS } from '~/utils/render'
import type {
  ActivityEvent,
  ActivityKind,
  ActivitySource,
} from '~/composables/useActivityFeed'

type PunkMarketStateColorKey = 'listed' | 'active_bids'
type WrappedPunkMarketStateColorKey = 'wrapped' | 'legacy_wrapped'
type WrapperActivitySource = 'wrapped_punks' | 'cryptopunks_721'

export type PunkStateBackgroundOptions = {
  showWrappedStateColors?: boolean
}

const STATE_PRIORITY = [
  ['listed', PUNK_BACKGROUNDS.listed],
  ['active_bids', PUNK_BACKGROUNDS.activeBid],
] as const satisfies readonly (readonly [PunkMarketStateColorKey, string])[]

const WRAPPED_STATE_PRIORITY = [
  ['wrapped', PUNK_BACKGROUNDS.wrapped],
  ['legacy_wrapped', PUNK_BACKGROUNDS.legacyWrapped],
  ...STATE_PRIORITY,
] as const satisfies readonly (readonly [
  PunkMarketStateColorKey | WrappedPunkMarketStateColorKey,
  string,
])[]

const ACTIVITY_LISTING_KINDS = new Set<ActivityKind>([
  'listing',
  'listing_cancelled',
])

const ACTIVITY_BID_KINDS = new Set<ActivityKind>([
  'bid',
  'bid_cancelled',
  'offer_placed',
  'offer_cancelled',
  'offer_adjusted',
])

const WRAPPER_ACTIVITY_BACKGROUNDS = {
  wrapped_punks: PUNK_BACKGROUNDS.legacyWrapped,
  cryptopunks_721: PUNK_BACKGROUNDS.wrapped,
} as const satisfies Record<WrapperActivitySource, string>

function isWrapperActivitySource(
  source: ActivitySource,
): source is WrapperActivitySource {
  return source === 'wrapped_punks' || source === 'cryptopunks_721'
}

function wrappedActivityBackground(source: ActivitySource): string | undefined {
  return isWrapperActivitySource(source)
    ? WRAPPER_ACTIVITY_BACKGROUNDS[source]
    : undefined
}

export function usePunkBackgrounds() {
  const { marketStateSets } = usePunkMarketState()

  function backgroundForPunkState(
    punkId: number,
    standard: TokenStandardValue = TokenStandard.CryptoPunks,
    options: PunkStateBackgroundOptions = {},
  ): string {
    if (standard !== TokenStandard.CryptoPunks) return PUNK_BACKGROUNDS.default

    const priority = options.showWrappedStateColors
      ? WRAPPED_STATE_PRIORITY
      : STATE_PRIORITY

    for (const [key, color] of priority) {
      if (marketStateSets.value[key].has(punkId)) return color
    }

    return PUNK_BACKGROUNDS.default
  }

  function backgroundForActivityEvent(
    event: Pick<ActivityEvent, 'kind' | 'source'>,
  ): string {
    if (event.kind === 'wrap' || event.kind === 'unwrap') {
      return wrappedActivityBackground(event.source) ?? PUNK_BACKGROUNDS.default
    }

    if (ACTIVITY_LISTING_KINDS.has(event.kind)) {
      return PUNK_BACKGROUNDS.listed
    }

    if (ACTIVITY_BID_KINDS.has(event.kind)) {
      return PUNK_BACKGROUNDS.activeBid
    }

    return PUNK_BACKGROUNDS.default
  }

  return {
    backgroundForPunkState,
    backgroundForActivityEvent,
  }
}
