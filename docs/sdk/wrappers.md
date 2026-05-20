# Wrappers

Wrapper clients live under `punks.wrappers`.

| Surface                 | Contract                        |
| ----------------------- | ------------------------------- |
| `punks.wrappers.modern` | `CryptoPunks721` modern wrapper |
| `punks.wrappers.c721`   | Alias for `modern`              |
| `punks.wrappers.legacy` | `WrappedPunk` (legacy wrapper)  |

Reads require a `publicClient`; executable writes require a `walletClient`.

## `CryptoPunks721`

The wrapper built by Yuga Labs uses the owner's Stash as the deposit target. A full wrap is
two user-visible steps: transfer the original Punk to the expected Stash, then
call `wrapPunk`.

```ts
const preflight = await punks.wrappers.modern.wrapPreflight({
  owner,
  punkId: 8348,
})

preflight.currentOwner
preflight.expectedStash
preflight.stashDeployed
preflight.nextStep
preflight.canSendNextStep
```

If `preflight.nextStep` is `deployStash`, deploy the Stash before depositing
the Punk:

```ts
await punks.wrappers.modern.deployStash(owner)
```

Prepare or execute the complete flow:

```ts
const steps = await punks.wrappers.modern.prepareWrapFlow({
  owner,
  punkId: 8348,
})

for (const step of steps) await walletClient.writeContract(step.request)

await punks.wrappers.modern.wrapFlow({
  owner,
  punkId: 8348,
})
```

Batch wrapping follows the same shape:

```ts
await punks.wrappers.modern.batchWrapFlow({
  owner,
  punkIds: [8348, 7804],
})
```

Other wrapper actions:

```ts
await punks.wrappers.modern.unwrap(8348)
await punks.wrappers.modern.unwrapPunkBatch([8348, 7804])
await punks.wrappers.modern.migrateLegacyWrappedPunks([8348])
await punks.wrappers.modern.rescuePunk(1234)
```

## `WrappedPunk`

The legacy wrapper uses a per-user proxy. Register the proxy once, transfer
the original Punk to that proxy, then call `mint`.

```ts
await punks.wrappers.legacy.registerProxy()

const preflight = await punks.wrappers.legacy.wrapPreflight({
  owner,
  punkId: 8348,
})

preflight.expectedProxy
preflight.proxyRegistered
preflight.nextStep
```

Prepare or execute the two-step flow:

```ts
const steps = await punks.wrappers.legacy.prepareWrapFlow({
  owner,
  punkId: 8348,
})

await punks.wrappers.legacy.wrapFlow({
  owner,
  punkId: 8348,
})
```

If no proxy is registered, `prepareWrapFlow()` rejects with a clear
`registerProxy` error. The modern flow similarly rejects when the owner has no
deployed Stash. Passing the zero address as a proxy or Stash also rejects
before a transaction request is returned.

## Approvals And Transfers

Both wrapper clients expose ERC-721 approvals and transfers:

```ts
const approval = await punks.wrappers.modern.approvalStatus({
  owner,
  operator,
  punkId: 8348,
})

await punks.wrappers.modern.approve({ operator, punkId: 8348 })
await punks.wrappers.modern.setApprovalForAll({ operator, approved: true })
await punks.wrappers.modern.transferFrom({
  from: owner,
  to: receiver,
  punkId: 8348,
})
```

Use the legacy client for the same operations on legacy wrapped tokens.
