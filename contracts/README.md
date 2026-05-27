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

## Local mainnet fork

`pnpm dev:fork` boots a long-running `hardhat node` forked from mainnet at block `25171056` (matching `hardhatMainnet.forking.blockNumber` in `hardhat.config.ts`), then seeds it with Punks so a recipient wallet has things to play with. The node keeps running on `http://127.0.0.1:8545` until Ctrl-C.

```sh
pnpm dev:fork
```

The fork block matches the `indexer/dumps/ponder-prod-block-25171056.zip` Postgres snapshot, so the indexer and the fork can be brought up against the same state.

Re-run the seed against an already-running fork:

```sh
pnpm seed:fork
```

The seed is idempotent — Punks already owned by the recipient are skipped.

Fast-forward the localhost chain time and mine one block:

```sh
pnpm fast-forward -- --hours 1 --minutes 30
```

Set `LOCALHOST_RPC_URL` to target a different local RPC URL.

Fund any account on the localhost chain:

```sh
pnpm fund:account -- 0xabc0000000000000000000000000000000000123
pnpm fund:account -- 0xabc0000000000000000000000000000000000123 --eth 25
```

This sets the account balance via `hardhat_setBalance`. The default amount is
`200` ETH; override it with `--eth` or `FUND_ACCOUNT_ETH`. The helper refuses
non-localhost chain IDs unless `FUND_ACCOUNT_ALLOW_NON_LOCALHOST=1` is set.

### Seeded transfers

| Source                                       | Collection        | Mechanism                       | Punks                                                                                |
| -------------------------------------------- | ----------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `0xaf7cf5910510b7cf912c156f91244487632e5fb6` | `CryptoPunks`     | native `transferPunk`           | 6225                                                                                 |
| `0xaf7cf5910510b7cf912c156f91244487632e5fb6` | `PunksV1Wrapper`  | ERC-721 `transferFrom`          | 1139, 1623, 1714, 1806, 2816, 3360, 4724, 4736, 5449, 5728, 6120, 8753, 9109         |
| `0xc6400A5584db71e41B0E5dFbdC769b54B91256CD` | `CryptoPunksMarket` | native `transferPunk`         | 1325, 4093, 4372, 5177, 6529, 9082                                                   |

The seed impersonates each source via `hardhat_impersonateAccount` + `hardhat_setBalance`, then submits the transfer transactions through viem's wallet client.

### Configuring the recipient

| Variable         | Default     | Purpose                                                                                                                                     |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEED_RECIPIENT` | `jalil.eth` | Destination for the seeded transfers. Accepts an `0x…` address (used as-is) or an ENS name (resolved against the fork via the universal resolver). The default resolves to `0xe11Da9560b51f8918295edC5ab9c0a90E9ADa20B` without an ENS lookup. |

```sh
SEED_RECIPIENT=0xabc...123 pnpm dev:fork
SEED_RECIPIENT=vitalik.eth pnpm seed:fork
```

## Deploying `PunksData`

Deployment of `PunksData` is split into two phases: a one-shot Ignition deploy, then a resumable script that loads the dataset blobs and seals the contract.

### 1. Generate the dataset

```sh
pnpm generate:punks-data
```

Writes the `.bin` files and `manifest.json` to `scripts/output/punks-data/`. Required before the load step.

### 2. Deploy the contract via Ignition

```sh
npx hardhat ignition deploy ignition/modules/PunksData.ts --network <network>
```

The module (`ignition/modules/PunksData.ts`) deploys `PunksData` with `initialAdmin` defaulting to `m.getAccount(0)`. Override with parameters if needed. The deployment artifact is written to `ignition/deployments/chain-<chainId>/`, including `deployed_addresses.json` (committed to the repo for non-local chains; `chain-31337` is gitignored).

Verify against Etherscan:

```sh
npx hardhat ignition verify chain-<chainId>
```

The Etherscan API key is read from the `ETHERSCAN_API_KEY` config variable.

### 3. Load and seal the dataset

```sh
pnpm load:punks-data
```

The script:

- Resolves the contract address from `PUNKS_DATA_ADDRESS`, or falls back to `ignition/deployments/chain-<chainId>/deployed_addresses.json`.
- Streams the eight blobs through `loadBlobChunk` (24,575 bytes per chunk).
- Streams the trait mask pairs, color masks, packed scalars, and color supplies through their batched loaders.
- Calls `seal` with the dataset commitment hashes from the manifest, then verifies the on-chain `datasetHash` matches.

At default settings (`STORAGE_BATCH=200`) the full load runs in ~187 transactions.

### Tuning and overrides

Environment variables read by the load script:

| Variable                   | Default                     | Purpose                                                                                                                                         |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUNKS_DATA_OUTPUT`        | `scripts/output/punks-data` | Source directory for `manifest.json` and `.bin` blobs.                                                                                          |
| `PUNKS_DATA_ADDRESS`       | (Ignition lookup)           | Override the resolved contract address.                                                                                                         |
| `PUNKS_DATA_DEPLOYMENT_ID` | `chain-<chainId>`           | Override the Ignition deployment folder used for address resolution.                                                                            |
| `PUNKS_DATA_STORAGE_BATCH` | `200`                       | Items per `loadTraitMaskPairs` / `loadColorMasks` / `loadPackedScalars` / `loadColorSupplies` call. Higher cuts tx count; bounded by block gas. |

### Resumability

The load script is resumable. After every confirmed receipt it writes progress to `scripts/output/punks-data/.load-state-<chainId>.json` via atomic `tmp + rename`. On restart it reads the file and resumes from the saved index per phase.

- **Word loaders** (`loadTraitMaskPairs`, `loadColorMasks`, `loadPackedScalars`, `loadColorSupplies`) are idempotent on-chain; re-running a saved index re-pays gas but is correct.
- **Blob loader** (`loadBlobChunk`) requires strict `chunkIndex == chunks.length`. Recovery relies on the state file matching reality.
- **`seal`** is single-use; once sealed the script skips it and only re-verifies the dataset hash.

The state file stamps the contract address and chain ID. If the script resolves to a different address on rerun (e.g. fresh deploy), it errors out and asks you to delete the file before continuing.

Edge case: if the process is killed between receipt confirmation and the state write, the saved index lags reality by one. On restart, the next `loadBlobChunk` reverts with `InvalidChunkIndex`. Bump the relevant counter in the JSON by one to recover, or `rm` the state file and start over.

## Contract Shape

`PunksAuction` is a CryptoPunks-only auction contract inspired by
`NetworkedAuctions` in the sibling `../contracts` repository.

The native ETH offer design is inspired by MouseDev's CryptoPunksBids,
concept by mousedev.eth and kilo.

- No lot creation fee.
- No settlement fee. The seller receives the full hammer price.
- Each seller's punks live in their own clone-based `PunksVault` (one vault per seller, deterministic via the `PunksVaultFactory`, shared across the canonical and V1 markets).
- Sellers deposit punks into their vault and approve `PunksAuction` as operator before creating a lot.
- Settlement routes through a dedicated `PunksAuctionEscrow` so `CryptoPunksMarket` records the escrow as seller and the auction as buyer on `PunkBought`. Same round-trip as `NetworkedAuctions`; if delivery fails, settlement reverts and can be retried.
- Native ETH offers follow MouseDev's max willingness-to-pay model with inclusion/exclusion Punk IDs and external trait filters.
- Immediate offer acceptance requires the Punk to be listed to the auctions contract on `CryptoPunksMarket`; offer-to-auction acceptance requires seller vault custody and opens a 24 hour auction.
