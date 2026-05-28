import {
  ZERO_ADDRESS,
  type PunkListing,
  type PunkMarketBid,
} from '@networked-art/punks-sdk'
import type { Address } from 'viem'
import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'
import {
  TokenStandard,
  auctionStatus,
  readAuctions,
  readLots,
  readOffer,
  readOffers,
  type AuctionRecord,
  type LotItem,
  type LotRecord,
  type OfferRecord,
  type TokenStandardValue,
} from '~/utils/auction'
import { queryIndexer } from '~/utils/indexer'

type DetailOwnerRow = {
  punk_id: string
  owner: Address | null
  native_owner: Address | null
  native_standard?: string | null
  is_wrapped: boolean
  wrapper: string | null
  block_number: string
}

type ListingRow = {
  punk_id: string
  seller: Address
  min_value_wei: string
  only_sell_to: Address | null
  active: boolean
}

type PunkBidRow = {
  punk_id: string
  bidder: Address
  value_wei: string
  active: boolean
}

type LotRow = {
  lot_id: string
  seller: Address
  reserve_wei: string
  only_sell_to: Address | null
  active: boolean
}

type LotItemRow = {
  lot_id: string
  item_index: number
  standard: string
  punk_id: string
  weight_bps: number
}

type AuctionRow = {
  auction_id: string
  lot_id: string
  seller: Address
  latest_bidder: Address
  latest_bid_wei: string
  end_timestamp: string
  settled: boolean
}

type OfferRow = {
  offer_id: string
  offerer: Address
  amount_wei: string
  active: boolean
  specific_punk_id: string | null
}

type AccountRow = {
  address: Address
  vault: Address | null
  stash: Address | null
}

type DetailFirstPageData = {
  punk?: DetailOwnerRow | null
  v1Punk?: DetailOwnerRow | null
  listing?: ListingRow | null
  punkBid?: PunkBidRow | null
  auctionLotItems: { items: LotItemRow[] }
  auctionOffers: { items: OfferRow[] }
}

type DetailRefsData = {
  auctionLots: { items: LotRow[] }
  auctionLotItems: { items: LotItemRow[] }
  auctionAuctions: { items: AuctionRow[] }
}

type CustodyData = {
  accounts: { items: AccountRow[] }
}

const DETAIL_FIRST_PAGE_QUERY = `
  query PunkDetailFirstPage($id: BigInt!, $standard: String!) {
    punk(punk_id: $id) {
      punk_id
      owner
      native_owner
      native_standard
      is_wrapped
      wrapper
      block_number
    }
    listing(punk_id: $id) {
      punk_id
      seller
      min_value_wei
      only_sell_to
      active
    }
    punkBid(punk_id: $id) {
      punk_id
      bidder
      value_wei
      active
    }
    auctionLotItems(
      where: { punk_id: $id, standard: $standard }
      orderBy: "lot_id"
      orderDirection: "asc"
      limit: 1000
    ) {
      items {
        lot_id
        item_index
        standard
        punk_id
        weight_bps
      }
    }
    auctionOffers(
      where: { active: true, specific_punk_id: $id }
      orderBy: "amount_wei"
      orderDirection: "desc"
      limit: 25
    ) {
      items {
        offer_id
        offerer
        amount_wei
        active
        specific_punk_id
      }
    }
  }
`

const V1_DETAIL_FIRST_PAGE_QUERY = `
  query V1PunkDetailFirstPage($id: BigInt!, $standard: String!) {
    v1Punk(punk_id: $id) {
      punk_id
      owner
      native_owner
      is_wrapped
      wrapper
      block_number
    }
    auctionLotItems(
      where: { punk_id: $id, standard: $standard }
      orderBy: "lot_id"
      orderDirection: "asc"
      limit: 1000
    ) {
      items {
        lot_id
        item_index
        standard
        punk_id
        weight_bps
      }
    }
    auctionOffers(
      where: { active: true, specific_punk_id: $id }
      orderBy: "amount_wei"
      orderDirection: "desc"
      limit: 25
    ) {
      items {
        offer_id
        offerer
        amount_wei
        active
        specific_punk_id
      }
    }
  }
`

const DETAIL_REFS_QUERY = `
  query PunkDetailRefs($lotIds: [BigInt!]!) {
    auctionLots(where: { lot_id_in: $lotIds }, limit: 100) {
      items {
        lot_id
        seller
        reserve_wei
        only_sell_to
        active
      }
    }
    auctionLotItems(
      where: { lot_id_in: $lotIds }
      orderBy: "item_index"
      orderDirection: "asc"
      limit: 1000
    ) {
      items {
        lot_id
        item_index
        standard
        punk_id
        weight_bps
      }
    }
    auctionAuctions(where: { lot_id_in: $lotIds, settled: false }, limit: 100) {
      items {
        auction_id
        lot_id
        seller
        latest_bidder
        latest_bid_wei
        end_timestamp
        settled
      }
    }
  }
`

const CUSTODY_QUERY = `
  query PunkDetailCustody($owner: String!) {
    accounts(where: { OR: [{ vault: $owner }, { stash: $owner }] }, limit: 1) {
      items {
        address
        vault
        stash
      }
    }
  }
`

export function usePunkDetailData(
  punkId: MaybeRefOrGetter<number>,
  standard: MaybeRefOrGetter<TokenStandardValue>,
) {
  const id = computed(() => toValue(punkId))
  const std = computed(() => toValue(standard))
  const { sdk, publicClient } = usePunksSdk()
  const readClient = useReadClient()
  const { matchesItem: offerSlotMatchesItem } = useOfferSlotMatching()
  const chainOwner = usePunkOwner(id, std, { immediate: false })

  const owner = ref<Address | null>(null)
  const nativeOwner = ref<Address | null>(null)
  const nativeStandard = ref<string | null>(null)
  const isWrapped = ref(false)
  const isVaulted = ref(false)
  const isStashed = ref(false)
  const listing = ref<PunkListing | null>(null)
  const bid = ref<PunkMarketBid | null>(null)
  const punkLots = ref<LotRecord[]>([])
  const punkAuctions = ref<AuctionRecord[]>([])
  const punkOffers = ref<OfferRecord[]>([])
  const fullLots = ref<LotRecord[] | null>(null)
  const pending = ref(false)
  const marketPending = ref(false)
  const auctionPending = ref(false)
  const offersPending = ref(false)
  const error = ref<string | null>(null)
  const marketError = ref<string | null>(null)
  const auctionError = ref<string | null>(null)
  const source = ref<'indexer' | 'onchain-fallback' | null>(null)
  let token = 0
  let ownerReconcileToken = 0
  let marketReconcileToken = 0
  let offerLoadToken = 0
  let fullOffersLoadedFor: string | null = null

  const ownerPending = computed(() => pending.value || chainOwner.pending.value)
  const settleLots = computed(() => fullLots.value ?? punkLots.value)

  async function refresh() {
    const currentToken = ++token
    reset()
    if (!validPunkId(id.value)) return

    pending.value = true
    error.value = null
    try {
      await loadIndexerSnapshot(currentToken)
      if (currentToken !== token) return
      source.value = 'indexer'
      queueReconciliation()
      queueFullOfferMatching()
    } catch (e) {
      if (currentToken !== token) return
      error.value = (e as Error).message
      await loadOnchainFallback(currentToken)
    } finally {
      if (currentToken === token) pending.value = false
    }
  }

  async function reconcileOwner() {
    const run = ++ownerReconcileToken
    const currentToken = token
    const currentId = id.value
    const currentStd = std.value
    if (!readClient.value || !validPunkId(currentId)) return false
    await chainOwner.refresh()
    if (
      run !== ownerReconcileToken ||
      currentToken !== token ||
      currentId !== id.value ||
      currentStd !== std.value ||
      chainOwner.error.value
    ) {
      return false
    }
    owner.value = chainOwner.owner.value
    nativeOwner.value = chainOwner.nativeOwner.value
    isWrapped.value = chainOwner.isWrapped.value
    isVaulted.value = chainOwner.isVaulted.value
    isStashed.value = chainOwner.isStashed.value
    return true
  }

  async function reconcileMarket() {
    const run = ++marketReconcileToken
    const currentToken = token
    const currentId = id.value
    const currentStd = std.value
    if (currentStd !== TokenStandard.CryptoPunks) return false
    const c = publicClient.value
    if (!c || !validPunkId(currentId)) return false

    marketPending.value = true
    marketError.value = null
    try {
      const [nextListing, nextBid] = await Promise.all([
        sdk.value.market.listing(currentId),
        sdk.value.market.bid(currentId),
      ])
      if (
        run !== marketReconcileToken ||
        currentToken !== token ||
        currentId !== id.value ||
        currentStd !== std.value
      ) {
        return false
      }
      listing.value = nextListing
      bid.value = nextBid
      return true
    } catch (e) {
      if (
        run !== marketReconcileToken ||
        currentToken !== token ||
        currentId !== id.value ||
        currentStd !== std.value
      ) {
        return false
      }
      marketError.value = (e as Error).message
      return false
    } finally {
      if (
        run === marketReconcileToken &&
        currentToken === token &&
        currentId === id.value &&
        currentStd === std.value
      ) {
        marketPending.value = false
      }
    }
  }

  async function ensureFullLots() {
    if (fullLots.value) return fullLots.value
    const c = readClient.value
    if (!c) return punkLots.value
    auctionPending.value = true
    try {
      fullLots.value = await readLots(c)
      return fullLots.value
    } finally {
      auctionPending.value = false
    }
  }

  watch([id, std], () => void refresh(), { immediate: true })
  watch(readClient, (client) => {
    if (client && source.value === 'indexer') queueFullOfferMatching()
    else if (client && error.value && !source.value) {
      void loadOnchainFallback(token)
    }
  })
  watch(publicClient, (client) => {
    if (client && source.value) queueReconciliation()
  })
  watch(sdk, () => {
    if (source.value) queueReconciliation()
  })

  return {
    owner,
    nativeOwner,
    nativeStandard,
    isWrapped,
    isVaulted,
    isStashed,
    ownerPending,
    listing,
    bid,
    punkLots,
    punkAuctions,
    punkOffers,
    settleLots,
    pending,
    marketPending,
    auctionPending,
    offersPending,
    error,
    marketError,
    auctionError,
    source,
    refresh,
    reconcileOwner,
    reconcileMarket,
    ensureFullLots,
  }

  function reset() {
    ownerReconcileToken += 1
    marketReconcileToken += 1
    offerLoadToken += 1
    owner.value = null
    nativeOwner.value = null
    nativeStandard.value = null
    isWrapped.value = false
    isVaulted.value = false
    isStashed.value = false
    listing.value = null
    bid.value = null
    punkLots.value = []
    punkAuctions.value = []
    punkOffers.value = []
    fullLots.value = null
    marketPending.value = false
    offersPending.value = false
    source.value = null
    fullOffersLoadedFor = null
    marketError.value = null
    auctionError.value = null
  }

  async function loadIndexerSnapshot(currentToken: number) {
    const standardName = indexerStandard(std.value)
    const first = await queryIndexer<DetailFirstPageData>(
      std.value === TokenStandard.CryptoPunksV1
        ? V1_DETAIL_FIRST_PAGE_QUERY
        : DETAIL_FIRST_PAGE_QUERY,
      { id: String(id.value), standard: standardName },
    )
    if (currentToken !== token) return

    await applyOwnerRow(
      std.value === TokenStandard.CryptoPunksV1 ? first.v1Punk : first.punk,
      currentToken,
    )
    if (std.value === TokenStandard.CryptoPunks) {
      listing.value = first.listing ? mapListing(first.listing) : null
      bid.value = first.punkBid ? mapBid(first.punkBid) : null
    }

    const lotIds = uniqueStrings(
      first.auctionLotItems.items.map((i) => i.lot_id),
    )
    if (lotIds.length) await loadIndexerAuctionRefs(lotIds, currentToken)
    await verifySpecificOffers(first.auctionOffers.items, currentToken)
  }

  async function applyOwnerRow(
    row: DetailOwnerRow | null | undefined,
    currentToken: number,
  ) {
    if (!row?.owner) return

    nativeOwner.value = row.native_owner
    nativeStandard.value =
      row.native_standard ??
      (std.value === TokenStandard.CryptoPunksV1 ? 'cryptopunks_v1' : null)

    const custody = await custodyFor(row.owner)
    if (currentToken !== token) return
    if (custody?.vault && sameAddress(custody.vault, row.owner)) {
      owner.value = custody.address
      isVaulted.value = true
      isWrapped.value = false
      isStashed.value = false
      return
    }
    if (custody?.stash && sameAddress(custody.stash, row.owner)) {
      owner.value = custody.address
      isVaulted.value = false
      isWrapped.value = false
      isStashed.value = true
      return
    }

    owner.value = row.owner
    isWrapped.value = row.is_wrapped
    isVaulted.value = false
    isStashed.value = false
  }

  async function custodyFor(ownerAddress: Address): Promise<AccountRow | null> {
    try {
      const data = await queryIndexer<CustodyData>(CUSTODY_QUERY, {
        owner: ownerAddress.toLowerCase(),
      })
      return data.accounts.items[0] ?? null
    } catch {
      return null
    }
  }

  async function loadIndexerAuctionRefs(
    lotIds: string[],
    currentToken: number,
  ) {
    auctionPending.value = true
    auctionError.value = null
    try {
      const refs = await queryIndexer<DetailRefsData>(DETAIL_REFS_QUERY, {
        lotIds,
      })
      if (currentToken !== token) return
      const itemsByLot = groupLotItems(refs.auctionLotItems.items)
      punkLots.value = refs.auctionLots.items
        .filter((row) => row.active)
        .map((row) => mapLot(row, itemsByLot.get(row.lot_id) ?? []))
      punkAuctions.value = refs.auctionAuctions.items
        .map((row) => mapAuction(row, itemsByLot.get(row.lot_id) ?? []))
        .filter((auction) => auctionStatus(auction) === 'live')
    } catch (e) {
      auctionError.value = (e as Error).message
      throw e
    } finally {
      auctionPending.value = false
    }
  }

  async function verifySpecificOffers(rows: OfferRow[], currentToken: number) {
    const c = readClient.value
    if (!c || !rows.length) return
    const run = ++offerLoadToken
    offersPending.value = true
    try {
      const offers = await Promise.all(
        rows.map((row) => readOffer(c, BigInt(row.offer_id)).catch(() => null)),
      )
      if (run !== offerLoadToken || currentToken !== token) return
      punkOffers.value = offers
        .filter((offer): offer is OfferRecord => !!offer)
        .filter((offer) =>
          offer.slots.some((slot) =>
            offerSlotMatchesItem(slot, {
              standard: std.value,
              punkId: id.value,
            }),
          ),
        )
        .sort(compareOffersByAmountDesc)
    } finally {
      if (run === offerLoadToken) offersPending.value = false
    }
  }

  async function loadFullOfferMatches() {
    const c = readClient.value
    const currentToken = token
    const key = `${std.value}-${id.value}`
    if (!c || fullOffersLoadedFor === key) return
    const run = ++offerLoadToken
    fullOffersLoadedFor = key
    offersPending.value = true
    try {
      const offers = await readOffers(c)
      if (
        run !== offerLoadToken ||
        currentToken !== token ||
        `${std.value}-${id.value}` !== key
      ) {
        return
      }
      punkOffers.value = offers
        .filter((offer) =>
          offer.slots.some((slot) =>
            offerSlotMatchesItem(slot, {
              standard: std.value,
              punkId: id.value,
            }),
          ),
        )
        .sort(compareOffersByAmountDesc)
    } catch {
      if (run === offerLoadToken && fullOffersLoadedFor === key) {
        fullOffersLoadedFor = null
      }
      // Exact offers from the indexer/targeted reads are still useful.
    } finally {
      if (run === offerLoadToken) offersPending.value = false
    }
  }

  async function loadOnchainFallback(currentToken: number) {
    const c = readClient.value
    if (!c) return
    source.value = 'onchain-fallback'
    await Promise.allSettled([
      reconcileOwner(),
      reconcileMarket(),
      (async () => {
        auctionPending.value = true
        offersPending.value = true
        try {
          const [lots, auctions, offers] = await Promise.all([
            readLots(c),
            readAuctions(c),
            readOffers(c),
          ])
          if (currentToken !== token) return
          fullLots.value = lots
          punkLots.value = lots.filter((lot) =>
            lot.items.some(matchesCurrentItem),
          )
          punkAuctions.value = auctions.filter(
            (auction) =>
              auctionStatus(auction) === 'live' &&
              auction.items.some(matchesCurrentItem),
          )
          punkOffers.value = offers
            .filter((offer) =>
              offer.slots.some((slot) =>
                offerSlotMatchesItem(slot, {
                  standard: std.value,
                  punkId: id.value,
                }),
              ),
            )
            .sort(compareOffersByAmountDesc)
        } finally {
          auctionPending.value = false
          offersPending.value = false
        }
      })(),
    ])
  }

  function queueReconciliation() {
    if (import.meta.server) return
    window.setTimeout(() => {
      void reconcileOwner()
      void reconcileMarket()
    }, 0)
  }

  function queueFullOfferMatching() {
    if (import.meta.server) return
    scheduleIdle(() => void loadFullOfferMatches())
  }

  function matchesCurrentItem(item: LotItem) {
    return item.punkId === id.value && item.standard === std.value
  }
}

type PunkDetailDataContext = ReturnType<typeof usePunkDetailData>

const punkDetailDataKey: InjectionKey<PunkDetailDataContext> =
  Symbol('punk-detail-data')

export function providePunkDetailData(data: PunkDetailDataContext) {
  provide(punkDetailDataKey, data)
}

export function usePunkDetailDataContext() {
  const data = inject(punkDetailDataKey)
  if (!data) throw new Error('Punk detail data has not been provided')
  return data
}

function mapListing(row: ListingRow): PunkListing {
  return {
    punkId: Number(row.punk_id),
    isForSale: row.active,
    seller: row.seller,
    priceWei: BigInt(row.min_value_wei),
    onlySellTo: row.only_sell_to ?? ZERO_ADDRESS,
  }
}

function mapBid(row: PunkBidRow): PunkMarketBid {
  return {
    punkId: Number(row.punk_id),
    hasBid: row.active,
    bidder: row.bidder,
    valueWei: BigInt(row.value_wei),
  }
}

function mapLot(row: LotRow, itemRows: LotItemRow[]): LotRecord {
  return {
    id: BigInt(row.lot_id),
    seller: row.seller,
    reserveWei: BigInt(row.reserve_wei),
    onlySellTo: row.only_sell_to ?? ZERO_ADDRESS,
    items: itemRows.map(mapLotItem),
  }
}

function mapAuction(row: AuctionRow, itemRows: LotItemRow[]): AuctionRecord {
  return {
    id: BigInt(row.auction_id),
    sourceLotId: BigInt(row.lot_id),
    seller: row.seller,
    latestBidder: row.latest_bidder,
    latestBidWei: BigInt(row.latest_bid_wei),
    endTimestamp: Number(row.end_timestamp),
    settled: row.settled,
    items: itemRows.map(mapLotItem),
  }
}

function mapLotItem(row: LotItemRow): LotItem {
  return {
    standard: standardFromIndexer(row.standard),
    punkId: Number(row.punk_id),
    weightBps: row.weight_bps,
  }
}

function groupLotItems(rows: LotItemRow[]) {
  const grouped = new Map<string, LotItemRow[]>()
  for (const row of rows) {
    const items = grouped.get(row.lot_id) ?? []
    items.push(row)
    grouped.set(row.lot_id, items)
  }
  for (const items of grouped.values()) {
    items.sort((a, b) => a.item_index - b.item_index)
  }
  return grouped
}

function indexerStandard(standard: TokenStandardValue) {
  return standard === TokenStandard.CryptoPunksV1
    ? 'cryptopunks_v1'
    : 'cryptopunks'
}

function standardFromIndexer(value: string): TokenStandardValue {
  return value === 'cryptopunks_v1'
    ? TokenStandard.CryptoPunksV1
    : TokenStandard.CryptoPunks
}

function compareOffersByAmountDesc(a: OfferRecord, b: OfferRecord) {
  return a.amountWei === b.amountWei ? 0 : a.amountWei > b.amountWei ? -1 : 1
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values))
}

function validPunkId(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 9999
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function scheduleIdle(callback: () => void) {
  type IdleWindow = Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number
  }
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(callback, { timeout: 1500 })
  } else {
    window.setTimeout(callback, 0)
  }
}
