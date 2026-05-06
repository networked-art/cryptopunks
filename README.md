# CryptoPunks Auctions

Hardhat 3 contracts for a zero-fee CryptoPunks auction house.

## Development

Run the test suite:

```sh
pnpm test
```

Run tests with Hardhat's built-in gas usage table:

```sh
pnpm test:gas
```

Typecheck the TypeScript tests and config:

```sh
pnpm typecheck
```

## Contract Shape

`CryptoPunksAuctions` is a CryptoPunks-only auction contract inspired by
`NetworkedAuctions` in the sibling `../contracts` repository.

- No lot creation fee.
- No settlement fee. The seller receives the full hammer price.
- Canonical CryptoPunks and unwrapped V1 CryptoPunks each get their own clone-based escrow.
- Sellers deposit punks into their deterministic vault before creating a lot.
- Settlement uses the same PunkBought round-trip as `NetworkedAuctions`; deferred delivery falls back to direct escrow transfer.
