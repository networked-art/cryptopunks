# V1 Wrapper

`punks.v1Wrapper` wraps the third-party `PunksV1Wrapper` ERC-721 at
[`0x282BDD42…`](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D),
which custodies the broken June 9th 2017 `CryptoPunks` one-to-one. The wrapper has
no native batch unwrap, so `punks.v1Wrapper` also routes batch calls through
the [`UnwrapV1Punks`](/contracts/punks-market/unwrap-v1-punks) helper at
[`unwrap.punksmarket.eth`](https://evm.now/address/0x6D263B22D1b2fEb93881AF6ff57666EfA5A8F346)
— a one-time `setApprovalForAll` lets the helper burn wrapper tokens on the
caller's behalf and forward the underlying Punks back.

Reads require a `publicClient`; writes require a `walletClient`.

```ts
const punks = createPunksSdk({ publicClient, walletClient })
```

## Reads

```ts
const owner = await punks.v1Wrapper.ownerOf(4156)
const isApproved = await punks.v1Wrapper.isApprovedForAll(owner, operator)
const exists = await punks.v1Wrapper.exists(4156)
const uri = await punks.v1Wrapper.tokenURI(4156)
```

`isApprovedForAll` is the standard ERC-721 read. Use the convenience method
when checking whether the batch-unwrap helper is approved:

```ts
const ready = await punks.v1Wrapper.isBatchUnwrapApproved(owner)
```

## Single-id writes

Every write has a `prepare*` equivalent that returns a `ContractWritePlan`.

```ts
await punks.v1Wrapper.wrap(4156)
await punks.v1Wrapper.unwrap(4156)

await punks.v1Wrapper.setApprovalForAll({
  operator: spender,
  approved: true,
})

await punks.v1Wrapper.approve({ to: spender, punkId: 4156 })
await punks.v1Wrapper.transferFrom({ from: owner, to: recipient, punkId: 4156 })
```

`wrap` is payable on the underlying contract; viem populates `value` from
the wallet's calldata defaults.

## Batch unwrap

`unwrapBatch` releases multiple wrapper tokens in a single transaction via
the helper. The caller must first approve the helper once on the wrapper:

```ts
await punks.v1Wrapper.approveBatchUnwrap()
await punks.v1Wrapper.unwrapBatch([4156, 7804, 8348])
```

`prepareUnwrapBatchFlow` reads the current approval state and returns the
ordered writes — approval included only when needed:

```ts
const steps = await punks.v1Wrapper.prepareUnwrapBatchFlow({
  owner,
  punkIds: [4156, 7804, 8348],
})

for (const step of steps) await walletClient.writeContract(step.request)
```

Or execute the composed flow with the configured wallet:

```ts
await punks.v1Wrapper.unwrapBatchFlow({
  owner,
  punkIds: [4156, 7804, 8348],
})
```

Both helpers throw if `punkIds` is empty or contains an id outside the
0–9999 range. Duplicates are de-duplicated before encoding.

## Errors

The helper reverts with two custom errors that surface through viem's
contract-error decoding:

- `NoPunkIds` — empty batch passed at the contract layer.
- `NotPunkOwner` — caller does not own one of the wrapper tokens at the
  moment of the call. The contract checks ownership per id before each
  `unwrap`, so a stale operator approval cannot drain a holder.

## Configuration

The wrapper address and helper address both default to mainnet. Override
either via `createPunksSdk`:

```ts
const punks = createPunksSdk({
  publicClient,
  walletClient,
  addresses: {
    v1Wrapper: '0x…',
    unwrapV1Punks: '0x…',
  },
})
```

Both addresses are also exported as constants:

```ts
import {
  PUNKS_V1_WRAPPER_ADDRESS,
  UNWRAP_V1_PUNKS_ADDRESS,
  UNWRAP_V1_PUNKS_ENS,
} from '@networked-art/punks-sdk'
```
