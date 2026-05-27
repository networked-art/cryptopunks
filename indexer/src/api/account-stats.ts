import { Hono } from 'hono'
import { and, eq, inArray, isNotNull, sql } from 'ponder'
import { db } from 'ponder:api'
import { account, event } from 'ponder:schema'
import { getAddress, isAddress } from 'viem'

// Cap the custody set we'll sum over so a malformed request can't fan out
// into a huge IN list. The intended caller (`useAccountStats` on the profile
// page) only ever passes EOA + vault + stash.
const MAX_ADDRESSES = 8

const app = new Hono()

function bigStr(value: unknown): string {
  return value == null ? '0' : String(value)
}

function toInt(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return Number.parseInt(String(value), 10)
}

function parseAddresses(value: string | undefined): `0x${string}`[] | null {
  if (!value) return null
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0 || parts.length > MAX_ADDRESSES) return null
  const out: `0x${string}`[] = []
  for (const p of parts) {
    if (!isAddress(p)) return null
    out.push(getAddress(p))
  }
  return out
}

// GET /accounts/stats?addresses=0xA,0xB,0xC&eoa=0xA
//
// Per-account aggregates derived from the unified `events` table:
//   - totalSpentWei / salesBoughtCount: sales where buyer ∈ addresses
//   - totalEarnedWei / salesSoldCount: sales where seller ∈ addresses
//   - lastActiveAt: accounts.last_interaction_at for the EOA — tx-from
//     rather than event-participant, which is the narrower "this user
//     personally signed something" signal.
//   - firstSeenAt: accounts.first_seen_at for the EOA — the first block
//     timestamp where the address appeared in any indexed punks event.
//
// `addresses` is the custody set (EOA + vault + stash). `eoa` is only used
// for the per-EOA lookups (last-active, first-seen).
app.get('/stats', async (c) => {
  const addresses = parseAddresses(c.req.query('addresses'))
  if (!addresses) {
    return c.json({ error: 'invalid_addresses' }, 400)
  }
  const eoaParam = c.req.query('eoa')
  if (!eoaParam || !isAddress(eoaParam)) {
    return c.json({ error: 'invalid_eoa' }, 400)
  }
  const eoa = getAddress(eoaParam)

  const [boughtRows, soldRows, accountRows] = await Promise.all([
    db
      .select({
        total: sql<string>`COALESCE(SUM(${event.wei_amount}), 0)::numeric`,
        count: sql<string>`COUNT(*)::bigint`,
      })
      .from(event)
      .where(
        and(
          eq(event.type, 'sale'),
          isNotNull(event.wei_amount),
          inArray(event.buyer, addresses),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(SUM(${event.wei_amount}), 0)::numeric`,
        count: sql<string>`COUNT(*)::bigint`,
      })
      .from(event)
      .where(
        and(
          eq(event.type, 'sale'),
          isNotNull(event.wei_amount),
          inArray(event.seller, addresses),
        ),
      ),
    db
      .select({
        last_interaction_at: account.last_interaction_at,
        first_seen_at: account.first_seen_at,
      })
      .from(account)
      .where(eq(account.address, eoa))
      .limit(1),
  ])

  const bought = boughtRows[0]
  const sold = soldRows[0]
  const last = accountRows[0]?.last_interaction_at ?? null
  const first = accountRows[0]?.first_seen_at ?? null

  return c.json({
    totalSpentWei: bigStr(bought?.total),
    totalEarnedWei: bigStr(sold?.total),
    salesBoughtCount: toInt(bought?.count),
    salesSoldCount: toInt(sold?.count),
    lastActiveAt: last == null ? null : last.toString(),
    firstSeenAt: first == null ? null : first.toString(),
  })
})

export default app
