# UnwrapV1Punks

`UnwrapV1Punks` is a tiny utility contract that unwraps a batch of
`PunksV1Wrapper` ERC-721 tokens back into their underlying June 2017
CryptoPunks in a single transaction. It exists so holders with multiple
wrapped Punks do not have to send one `unwrap` per token.

The contract lives at `contracts/contracts/UnwrapV1Punks.sol`. It is
stateless and owner-less — a one-shot helper around the third-party
`PunksV1Wrapper`.

## Purpose

The third-party `PunksV1Wrapper` ERC-721 at
[`0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D)
wraps each broken June 2017 CryptoPunk one-to-one with a standards-compliant
NFT. Its `unwrap(tokenId)` releases the underlying Punk to whoever called
it, but only handles one id at a time.

`UnwrapV1Punks.unwrap(uint16[])` batches that call. For each id it:

1. Checks that `msg.sender` is the current ERC-721 owner of the wrapper
   token.
2. Calls `WRAPPER.unwrap(punkId)` — the wrapper burns the token and
   transfers the Punk to `UnwrapV1Punks`.
3. Calls `PUNKS_V1.transferPunk(msg.sender, punkId)` to forward the Punk
   to the caller.

The per-id ownership check is deliberate: a wrapper operator approval alone
(`setApprovalForAll(unwrap, true)`) is not enough to drain a holder.
`UnwrapV1Punks` will only unwrap tokens the *caller* owns at the moment of
the call, even if it is approved for other holders.

## Immutable Dependencies

| Constant   | Address                                                                                                            | Role                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `WRAPPER`  | [`0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D`](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D) | Third-party `PunksV1Wrapper` ERC-721 that custodies the wrapped Punks |
| `PUNKS_V1` | [`0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D`](https://evm.now/address/0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D) | The June 2017 CryptoPunks market the underlying Punks live on        |

Both addresses are baked into the bytecode and cannot be changed after
deployment.

## Constructor

```solidity
constructor()
```

The constructor takes no arguments. It calls the ENS reverse registrar at
`0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb` to set the contract's reverse
name to `unwrap.punksmarket.eth`.

## Unwrapping

```solidity
function unwrap(uint16[] calldata punkIds) external;
```

Burns each wrapper token in `punkIds` and transfers the underlying Punks to
`msg.sender`. The batch is atomic: any per-id failure reverts the whole
call.

Caller requirements:

1. **Own every id in the batch.** `WRAPPER.ownerOf(punkId) == msg.sender`
   must hold for each entry. Otherwise the call reverts with
   `NotPunkOwner`.
2. **Pre-approve this contract on the wrapper** with a one-time
   [`setApprovalForAll(unwrap.punksmarket.eth, true)`](https://evm.now/address/0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D/interact#setApprovalForAll:::0x6D263B22D1b2fEb93881AF6ff57666EfA5A8F346:::true)
   on `PunksV1Wrapper`. Per-token `approve(unwrap, tokenId)` also works but
   would have to be re-issued for every batch.
3. **Pass a non-empty list.** An empty `punkIds` reverts with `NoPunkIds`.

There is no `recipient` parameter. The unwrapped Punks always land on
`msg.sender`. Smart-wallet users should call from the wallet that owns the
wrapper tokens, not from an EOA acting on behalf of the wallet.

Emits `PunksUnwrapped(msg.sender, punkIds)` once at the end of the batch.

### Usage flow

```solidity
// One-time, on the wrapper (only needed once per owner).
IPunksV1Wrapper wrapper = IPunksV1Wrapper(0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D);
wrapper.setApprovalForAll(address(unwrapV1Punks), true);

// Repeat per batch.
uint16[] memory punkIds = new uint16[](3);
punkIds[0] = 1234;
punkIds[1] = 4567;
punkIds[2] = 8901;
unwrapV1Punks.unwrap(punkIds);
```

After the call, the underlying Punks are owned by the caller on the
original CryptoPunks market and the wrapper tokens are burned.

## Events

```solidity
event PunksUnwrapped(address indexed caller, uint16[] punkIds);
```

Emitted once at the end of `unwrap`, with the full batch as a single event.
Indexers that need per-Punk records should also watch the wrapper's own
`Unwrap` / `Transfer` events.

## Errors

| Error          | When                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `NoPunkIds`    | `unwrap` called with an empty `punkIds` array                                       |
| `NotPunkOwner` | `msg.sender` is not the wrapper-token owner of one of the supplied ids             |

The wrapper itself can also revert (e.g. missing approval, non-existent
token). Those reverts surface as raw `PunksV1Wrapper` errors and abort the
whole batch.

## Deployment

The Ignition module at `contracts/ignition/modules/UnwrapV1Punks.ts`
deploys the contract with no parameters.

| Contract        | Address                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `UnwrapV1Punks` | [`0x6D263B22D1b2fEb93881AF6ff57666EfA5A8F346`](https://evm.now/address/unwrap.punksmarket.eth) |

The contract is deployed only on Ethereum mainnet.

## Integration notes

- **Approval scope.** `setApprovalForAll(unwrap, true)` lets this contract
  call `unwrap(tokenId)` against any wrapper token the caller owns at call
  time. The per-call `ownerOf` check inside `UnwrapV1Punks` is what
  prevents the operator approval from being abused by a third party who
  later tries to drain the same holder.
- **Batch size.** There is no explicit cap. Per-id gas is dominated by the
  two external calls (`WRAPPER.unwrap` and `PUNKS_V1.transferPunk`) plus the
  ownership read. Size the batch to the block gas limit with margin.
- **Atomicity.** A single id failing reverts the whole batch. There is no
  partial-success mode. If one of the ids in a batch has been transferred
  out from under the caller in the same block, the whole call reverts and
  the rest of the batch can be resubmitted.
- **No ETH.** `unwrap` is not `payable`. Sending ETH reverts.
- **Listing the underlying Punks.** Once unwrapped, holders may want to
  list the Punks for sale through [`PunksMarket`](/contracts/punks-market)
  using the original market's
  [`offerPunkForSaleToAddress`](/contracts/punks-market#creating-a-directed-listing)
  with `toAddress = punksmarket.eth`.
