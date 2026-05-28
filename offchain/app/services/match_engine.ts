import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import IndexerCursor from '#models/indexer_cursor'
import Search from '#models/search'
import SearchMatch from '#models/search_match'
import NotificationDelivery from '#models/notification_delivery'
import {
  fetchEvents,
  IndexerNotConfigured,
  type ActivityKind,
  type ActivitySource,
  type IndexerEvent,
} from '#services/indexer_client'
import { searchMatchingIds } from '#services/criteria'

const CURSOR_KEY = 'search_matcher'

export type TickResult = {
  scannedEvents: number
  matches: number
  cursor: { blockNumber: bigint; logIndex: number; eventId: string | null }
}

/**
 * One full pass of the match engine.
 *
 * Loads the cursor, asks the indexer for new events past it, evaluates every
 * `notify=true` saved search against each event's punk, inserts a
 * `search_matches` row for each fresh hit, and enqueues one
 * `notification_deliveries` row per match. Advances the cursor at the end.
 */
export async function runMatcherTick(opts: { limit?: number } = {}): Promise<TickResult> {
  const cursor = await loadCursor()
  const searches = await Search.query().where('notify', true)
  if (searches.length === 0) {
    return { scannedEvents: 0, matches: 0, cursor: cursorState(cursor) }
  }

  const allKinds = new Set<ActivityKind>()
  const allSources = new Set<ActivitySource>()
  for (const s of searches) {
    for (const k of s.notifyKinds) allKinds.add(k)
    for (const src of s.notifySources) allSources.add(src)
  }

  let events: IndexerEvent[] = []
  try {
    const page = await fetchEvents({
      kinds: [...allKinds],
      sources: [...allSources],
      afterBlockNumber: cursor.lastBlockNumber,
      limit: opts.limit ?? 100,
    })
    events = page.events
  } catch (err) {
    if (err instanceof IndexerNotConfigured) {
      logger.warn('matcher tick: INDEXER_GRAPHQL_URL not configured, skipping')
      return { scannedEvents: 0, matches: 0, cursor: cursorState(cursor) }
    }
    throw err
  }

  if (events.length === 0) {
    return { scannedEvents: 0, matches: 0, cursor: cursorState(cursor) }
  }

  const matchCache = new Map<number, Set<number>>()
  function matchSet(search: Search): Set<number> {
    let s = matchCache.get(search.id)
    if (!s) {
      s = new Set(searchMatchingIds(search.criteria))
      matchCache.set(search.id, s)
    }
    return s
  }

  let totalMatches = 0
  let lastBlockNumber = cursor.lastBlockNumber
  let lastLogIndex = cursor.lastLogIndex
  let lastEventId: string | null = cursor.lastEventId

  for (const event of events) {
    if (event.punkId === null) {
      lastBlockNumber = event.blockNumber
      lastLogIndex = event.logIndex
      lastEventId = event.id
      continue
    }
    for (const search of searches) {
      if (!search.notifyKinds.includes(event.type)) continue
      if (!search.notifySources.includes(event.source)) continue
      if (search.maxPriceWei !== null) {
        const price = event.listingWei ?? event.weiAmount
        if (price !== null && price > BigInt(search.maxPriceWei)) continue
      }
      if (!matchSet(search).has(event.punkId)) continue

      const inserted = await recordMatch(search, event)
      if (inserted) totalMatches += 1
    }
    lastBlockNumber = event.blockNumber
    lastLogIndex = event.logIndex
    lastEventId = event.id
  }

  cursor.lastBlockNumber = lastBlockNumber
  cursor.lastLogIndex = lastLogIndex
  cursor.lastEventId = lastEventId
  await cursor.save()

  return {
    scannedEvents: events.length,
    matches: totalMatches,
    cursor: cursorState(cursor),
  }
}

async function recordMatch(search: Search, event: IndexerEvent): Promise<boolean> {
  return db.transaction(async (trx) => {
    const existing = await SearchMatch.query({ client: trx })
      .where('searchId', search.id)
      .where('eventId', event.id)
      .first()
    if (existing) return false

    const match = await SearchMatch.create(
      {
        searchId: search.id,
        eventId: event.id,
        tokenId: event.punkId!,
        matchedAt: DateTime.now(),
      },
      { client: trx }
    )

    search.useTransaction(trx)
    search.lastMatchedAt = DateTime.now()
    await search.save()

    const delivery = await NotificationDelivery.create(
      {
        userId: search.userId,
        channel: 'email',
        type: 'search_match',
        payload: {
          searchId: search.id,
          searchName: search.name,
          eventId: event.id,
          punkId: event.punkId,
          source: event.source,
          kind: event.type,
          listingWei: event.listingWei?.toString() ?? null,
          weiAmount: event.weiAmount?.toString() ?? null,
          txHash: event.txHash,
        },
        dedupeKey: `search:${search.id}:${event.id}`,
        status: 'queued',
        attemptCount: 0,
        lastError: null,
        queuedAt: DateTime.now(),
        sentAt: null,
        failedAt: null,
      },
      { client: trx }
    )

    match.useTransaction(trx)
    match.deliveryId = delivery.id
    await match.save()

    return true
  })
}

async function loadCursor(): Promise<IndexerCursor> {
  const existing = await IndexerCursor.find(CURSOR_KEY)
  if (existing) return existing
  return IndexerCursor.create({
    key: CURSOR_KEY,
    lastBlockNumber: 0n,
    lastLogIndex: 0,
    lastEventId: null,
    startedAt: DateTime.now(),
  })
}

function cursorState(c: IndexerCursor) {
  return {
    blockNumber: c.lastBlockNumber,
    logIndex: c.lastLogIndex,
    eventId: c.lastEventId,
  }
}
