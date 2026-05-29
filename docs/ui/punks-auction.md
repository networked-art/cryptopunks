# punks.auction

[punks.auction](https://punks.auction) is the web interface for the
[`PunksAuction`](/contracts/punks-auction) house — the zero-fee venue for
24-hour auctions, multi-Punk lots, and native-ETH purchase offers across
both Punk markets. It is a Nuxt 4 app that extends the shared
`@1001-digital/layers.evm` layer for wallet plumbing and UI primitives.

## Interface

| Route                  | What it shows                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `/`                    | Landing page.                                                                       |
| `/punks`               | Search and grid over the collection; `/punks/[id]` and `/punks/v1/[id]` open a Punk. |
| `/auctions`            | Live auctions, with open lots below; `/auctions/[id]` is a single auction.          |
| `/lots/new`            | Create a lot from vaulted Punks; `/lots/[id]` is a single lot.                      |
| `/purchase-offers`     | Open native-ETH offers; `/purchase-offers/new` places one, `/[id]` opens one.       |
| `/activity`            | Recent auction-house and market activity.                                           |
| `/profile/[handle]`    | An address or ENS name: owned Punks and claimable escrow, with `/vault`, `/offers`, `/wrappers`, and `/settings` sub-pages. |
| `/about`, `/terms`     | Project context and terms.                                                          |

A Punk's detail page surfaces any auction, lot, or offer it currently
appears in, so the seller and buyer flows are reachable from the Punk
itself.

## How it works

- **Reads.** The collection (search, traits, rendering) is served from the
  SDK's bundled offline dataset (`@networked-art/punks-sdk`); the grid uses
  a CDN-hosted sprite sheet and detail views render through the SDK's
  renderer. Live auctions, lots, and offers are read from `PunksAuction`
  on-chain via viem `multicall` over `lastAuctionId` / `lastLotId` /
  `lastOfferId` and the public getters.
- **Writes.** Wallet actions — creating lots, opening and bidding on
  auctions, placing and managing offers, vault deposits and approvals — are
  built by the SDK as contract write plans and sent through the connected
  wallet with wagmi. The SDK owns the address/ABI/args/value; wagmi owns the
  wallet transport.
- **Activity feed.** `/activity` is served by the indexer at
  `indexer.punks.auction` (a Ponder/Postgres service), reading the
  `cryptopunks_v2`, `wrapped_punks`, `cryptopunks_721`, and `punks_auction`
  sources.
- **RPC proxy.** A server route keeps the upstream RPC URL and key
  server-side; the browser talks to a same-origin `/api/rpc` that forwards
  only an allowlist of read methods.

Mainnet-only — the wagmi config declares no other chain. For the contract
behind it, see [`PunksAuction`](/contracts/punks-auction); for the
matching client surface, see [Offers And Auctions](/sdk/offers-and-auctions).
