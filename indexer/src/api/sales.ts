import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from 'ponder:api'
import { event } from 'ponder:schema'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const app = new Hono()

// GET /sales — recent sale events. `usd_value_cents` is cached on each row
// at indexing time (see `src/prices.ts`), so this is a single onchain table
// read with no JOIN.
app.get('/', async (c) => {
  const limit = clampLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))

  const rows = await db
    .select()
    .from(event)
    .where(and(eq(event.type, 'sale'), isNotNull(event.wei_amount)))
    .orderBy(desc(event.timestamp))
    .limit(limit)
    .offset(offset)

  const items = rows.map((row) => ({
    id: row.id,
    source: row.source,
    type: row.type,
    punk_id: row.punk_id?.toString() ?? null,
    buyer: row.buyer,
    seller: row.seller,
    wei_amount: row.wei_amount?.toString() ?? null,
    usd_value_cents: row.usd_value_cents?.toString() ?? null,
    tx_hash: row.tx_hash,
    block_number: row.block_number.toString(),
    timestamp: row.timestamp.toString(),
    day_unix: row.day_unix.toString(),
  }))

  return c.json({ items, limit, offset })
})

function clampLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function parseOffset(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export default app
