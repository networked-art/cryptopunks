import { formatEther } from 'viem'
import {
  formatFullUsdDollars,
  roundedUsdDollarsForWei,
  type AmountInput,
} from '~/utils/priceDisplay'

export type PriceDisplayMode = 'eth' | 'usd'

const PRICE_DISPLAY_STATE_KEY = 'punks-auction:price-display-mode'
const PRICE_DISPLAY_COOKIE = 'punks_auction_price_mode'

let pendingEthUsdFetch: Promise<void> | null = null

export function usePriceDisplayMode() {
  const cookie = useCookie<PriceDisplayMode>(PRICE_DISPLAY_COOKIE, {
    default: () => 'eth',
    sameSite: 'lax',
  })
  const mode = useState<PriceDisplayMode>(PRICE_DISPLAY_STATE_KEY, () =>
    normalizePriceDisplayMode(cookie.value),
  )

  function setMode(nextMode: PriceDisplayMode) {
    const normalized = normalizePriceDisplayMode(nextMode)
    mode.value = normalized
    cookie.value = normalized
  }

  function toggleMode() {
    setMode(mode.value === 'eth' ? 'usd' : 'eth')
  }

  return {
    mode,
    isETH: computed(() => mode.value === 'eth'),
    isUSD: computed(() => mode.value === 'usd'),
    setMode,
    toggleMode,
  }
}

export function useEthUsdPriceFeed() {
  const priceFeed = usePriceFeed()

  function fetchPriceOnce() {
    if (pendingEthUsdFetch) return pendingEthUsdFetch

    pendingEthUsdFetch = Promise.resolve(priceFeed.fetchPrice()).finally(() => {
      pendingEthUsdFetch = null
    })
    return pendingEthUsdFetch
  }

  return {
    ...priceFeed,
    fetchPriceOnce,
  }
}

export function usePriceDisplayText() {
  const { mode } = usePriceDisplayMode()
  const { ethUSDRaw, fetchPriceOnce } = useEthUsdPriceFeed()
  const isUSD = computed(() => mode.value === 'usd')

  if (import.meta.client) {
    watch(
      isUSD,
      (enabled) => {
        if (enabled) void fetchPriceOnce()
      },
      { immediate: true },
    )
  }

  function formatWeiAmount(weiInput: AmountInput) {
    const wei = BigInt(weiInput)
    if (!isUSD.value) return `${formatEther(wei)} ETH`
    if (!ethUSDRaw.value || ethUSDRaw.value <= 0n) return 'USD unavailable'
    return formatFullUsdDollars(roundedUsdDollarsForWei(wei, ethUSDRaw.value))
  }

  return {
    formatWeiAmount,
  }
}

function normalizePriceDisplayMode(value: unknown): PriceDisplayMode {
  return value === 'usd' ? 'usd' : 'eth'
}
