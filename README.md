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
- Canonical CryptoPunks and unwrapped V1 CryptoPunks each get their own clone-based escrow.
- Sellers deposit punks into their deterministic vault before creating a lot.
- Settlement uses the same PunkBought round-trip as `NetworkedAuctions`; if delivery fails, settlement reverts and can be retried.
- Native ETH offers follow MouseDev's max willingness-to-pay model with optional settlement bounties, receiver addresses, inclusion/exclusion Punk IDs, and external trait filters.
- Immediate offer acceptance requires the Punk to be listed to the auctions contract on the original CryptoPunks marketplace; offer-to-auction acceptance requires seller vault custody and opens a 24 hour auction.
