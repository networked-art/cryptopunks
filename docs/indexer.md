# Indexer

The indexer is a [Ponder](https://ponder.sh) service that tracks the entire
Punks stack — both markets, every wrapper, `PunksMarket`, `PunksAuction`,
and the vault/stash custody contracts — in one process. It is the data
source behind the activity feeds, profile pages, and bid/offer matching in
[punks.auction](/ui/punks-auction) and
[punksmarket.app](/ui/punksmarket-app).

It lives at `indexer/`. An example deployment runs at
[`indexer.punksmarket.app`](https://indexer.punksmarket.app). The package
README covers the operational side — local Postgres, fork mode, snapshots,
and Kamal deployment — that these pages do not.

## What it watches

| Contract              | Address                                                                                                            | Tracked as                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `CryptoPunks`         | [`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | The June 9th 2017 contract and its native market |
| `CryptoPunksMarket`   | [`0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB`](https://evm.now/address/0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB) | The canonical June 22nd 2017 market              |
| `WrappedPunk`         | [`0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6`](https://evm.now/address/0xb7f7F6C52F2e2fdb1963Eab30438024864c313F6) | ERC-721 wrapper for canonical Punks              |
| `CryptoPunks721`      | [`0x000000000000003607fce1aC9E043a86675C5C2F`](https://evm.now/address/0x000000000000003607fce1aC9E043a86675C5C2F) | ERC-721 wrapper for canonical Punks              |
| `PunksV1Wrapper`      | [`0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D) | ERC-721 wrapper for June 9th 2017 Punks          |
| `PunksMarket`         | [`0x64e507FEBF26521b73FbdfA533106B2042533218`](https://evm.now/address/0x64e507FEBF26521b73FbdfA533106B2042533218) | Criteria-bid market over the June 9th contract   |
| `PunksAuction`        | [`0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873`](https://evm.now/address/0x6f99d7E85b4Ba6fFD9ff60A09fc12201027b7873) | Auction house: lots, auctions, offers            |
| `PunksVaultFactory`   | [`0xf3381B259B2FE142c0A87bffF463695d935D6F66`](https://evm.now/address/0xf3381B259B2FE142c0A87bffF463695d935D6F66) | Punks Vault custody                              |
| `StashFactory`        | [`0x000000000000A6fA31F5fC51c1640aAc76866750`](https://evm.now/address/0x000000000000A6fA31F5fC51c1640aAc76866750) | Stash custody                                    |

## Provenance model

Canonical Punks and June 9th 2017 Punks are tracked as two separate
current-state collections:

- `punks` — the canonical collection plus its two ERC-721 wrappers.
- `v1_punks` — the June 9th 2017 contract plus its ERC-721 wrapper.

While a Punk is wrapped, the user-facing `owner` column reflects the
ERC-721 owner, and the underlying native owner (the wrapper itself) is
preserved in `native_owner`. Unwrapping restores the native owner via an
on-chain read. Both collections follow the same public-owner model.

## Documentation Sections

| Section                            | Use it for                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Schema](/indexer/schema)          | The unified event log, current-state tables, `PunksMarket` and auction tables, and USD pricing   |
| [API](/indexer/api)                | The GraphQL, raw-SQL, and purpose-built REST routes the service exposes                          |

For setup, local Postgres, fork mode, and deployment, see the
[`indexer/` README](https://github.com/networked-art/cryptopunks/tree/master/indexer).
