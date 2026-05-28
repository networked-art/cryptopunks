import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import Search, { DEFAULT_NOTIFY_KINDS, DEFAULT_NOTIFY_SOURCES } from '#models/search'
import SearchMatch from '#models/search_match'
import NotificationDelivery from '#models/notification_delivery'
import IndexerCursor from '#models/indexer_cursor'
import * as indexerClient from '#services/indexer_client'
import type { IndexerEvent } from '#services/indexer_client'
import { runMatcherTick } from '#services/match_engine'

async function cleanup() {
  await db.from('search_matches').delete()
  await db.from('notification_deliveries').delete()
  await db.from('inquiries').delete()
  await db.from('searches').delete()
  await db.from('indexer_cursor').delete()
  await db.from('users').delete()
}

function makeEvent(overrides: Partial<IndexerEvent> = {}): IndexerEvent {
  return {
    id: '0xevent-1',
    type: 'listing',
    source: 'cryptopunks_v2',
    punkId: 635,
    actor: null,
    from: null,
    to: null,
    buyer: null,
    seller: null,
    bidder: null,
    weiAmount: null,
    listingWei: 1_000_000_000_000_000_000n,
    txHash: '0xtx-1',
    blockNumber: 100n,
    logIndex: 1,
    timestamp: 1_700_000_000,
    ...overrides,
  }
}

test.group('match engine', (group) => {
  group.each.setup(cleanup)
  group.each.teardown(cleanup)

  test('records a match and enqueues a delivery for a matching event', async ({ assert }) => {
    const user = await User.create({ email: 'matcher@example.com' })
    await Search.create({
      userId: user.id,
      name: 'Aliens',
      criteria: { type: 'alien' },
      notify: true,
      notifyFrequency: 'immediate',
      notifySources: DEFAULT_NOTIFY_SOURCES,
      notifyKinds: DEFAULT_NOTIFY_KINDS,
      maxPriceWei: null,
      lastMatchedAt: null,
    })

    const original = indexerClient.fetchEvents
    ;(indexerClient as any).fetchEvents = async () => ({
      events: [makeEvent()],
      hasNextPage: false,
      endCursor: null,
    })
    try {
      const result = await runMatcherTick({})
      assert.equal(result.scannedEvents, 1)
      assert.equal(result.matches, 1)
    } finally {
      ;(indexerClient as any).fetchEvents = original
    }

    const matches = await SearchMatch.all()
    assert.equal(matches.length, 1)
    assert.equal(matches[0].tokenId, 635)

    const deliveries = await NotificationDelivery.all()
    assert.equal(deliveries.length, 1)
    assert.equal(deliveries[0].type, 'search_match')
    assert.equal(deliveries[0].status, 'queued')

    const cursor = await IndexerCursor.find('search_matcher')
    assert.equal(cursor!.lastBlockNumber, 100n)
  })

  test('dedupes a repeat event', async ({ assert }) => {
    const user = await User.create({ email: 'd@example.com' })
    await Search.create({
      userId: user.id,
      name: 'Aliens',
      criteria: { type: 'alien' },
      notify: true,
      notifyFrequency: 'immediate',
      notifySources: DEFAULT_NOTIFY_SOURCES,
      notifyKinds: DEFAULT_NOTIFY_KINDS,
      maxPriceWei: null,
      lastMatchedAt: null,
    })

    const original = indexerClient.fetchEvents
    let calls = 0
    ;(indexerClient as any).fetchEvents = async () => ({
      events: [makeEvent({ blockNumber: 100n + BigInt(++calls) })],
      hasNextPage: false,
      endCursor: null,
    })
    try {
      await runMatcherTick({})
      await runMatcherTick({})
    } finally {
      ;(indexerClient as any).fetchEvents = original
    }

    const matches = await SearchMatch.all()
    assert.equal(matches.length, 1)
  })

  test('does not match a non-matching event', async ({ assert }) => {
    const user = await User.create({ email: 'nm@example.com' })
    await Search.create({
      userId: user.id,
      name: 'Aliens',
      criteria: { type: 'alien' },
      notify: true,
      notifyFrequency: 'immediate',
      notifySources: DEFAULT_NOTIFY_SOURCES,
      notifyKinds: DEFAULT_NOTIFY_KINDS,
      maxPriceWei: null,
      lastMatchedAt: null,
    })

    const original = indexerClient.fetchEvents
    ;(indexerClient as any).fetchEvents = async () => ({
      events: [makeEvent({ punkId: 1 })],
      hasNextPage: false,
      endCursor: null,
    })
    try {
      const result = await runMatcherTick({})
      assert.equal(result.matches, 0)
    } finally {
      ;(indexerClient as any).fetchEvents = original
    }

    assert.equal((await SearchMatch.all()).length, 0)
    assert.equal((await NotificationDelivery.all()).length, 0)
    DateTime.now() // suppress unused
  })

  test('drops events above max_price_wei', async ({ assert }) => {
    const user = await User.create({ email: 'price@example.com' })
    await Search.create({
      userId: user.id,
      name: 'cheap aliens',
      criteria: { type: 'alien' },
      notify: true,
      notifyFrequency: 'immediate',
      notifySources: DEFAULT_NOTIFY_SOURCES,
      notifyKinds: DEFAULT_NOTIFY_KINDS,
      maxPriceWei: '500000000000000000', // 0.5 ETH ceiling
      lastMatchedAt: null,
    })

    const original = indexerClient.fetchEvents
    ;(indexerClient as any).fetchEvents = async () => ({
      events: [makeEvent({ listingWei: 1_000_000_000_000_000_000n })],
      hasNextPage: false,
      endCursor: null,
    })
    try {
      const result = await runMatcherTick({})
      assert.equal(result.matches, 0)
    } finally {
      ;(indexerClient as any).fetchEvents = original
    }
  })
})
