# v1-punks-indexer

Ponder indexer for CryptoPunks V1, the V1 ERC-721 wrapper, and this repo's
`PunksMarket.sol`.

## Setup

Copy `.env.local.example` to `.env.local` and set:

- `PONDER_RPC_URLS_1`: one or more mainnet HTTP RPC URLs separated by spaces.
- `PONDER_RPC_FALLBACK_URLS_1`: optional fallback HTTP RPC URLs.
- `PONDER_WS_URL_1`: optional mainnet WebSocket RPC URL.
- `PUNKS_MARKET_ADDRESS`: deployed `PunksMarket.sol` address.
- `PUNKS_MARKET_START_BLOCK`: deployment block for `PUNKS_MARKET_ADDRESS`.
- `DATABASE_URL`: Postgres URL for ENS profile cache and Ponder.

If `PUNKS_MARKET_ADDRESS` is unset, the generated config keeps the contract
shape available for type generation but points it at the zero address.
