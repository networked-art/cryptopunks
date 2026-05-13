# PunkVault ERC721/ERC1155 Audit — findings

**Date:** 2026-05-13
**Scope:**
- `contracts/contracts/PunkVault.sol`
- `contracts/contracts/PunkVaultFactory.sol`

**Checklist:** [evm-audit-erc721](https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-erc721/references/checklist.md)

## Preamble

`PunkVault` is a deterministic per-user smart account (ERC-1167 clone with appended immutable args) intended as the canonical holder of CryptoPunks across every CryptoPunks-compatible market. It is **not** an ERC721 issuer; it implements the receive side of ERC721 / ERC1155 plus ERC-1271 for signature delegation, and exposes a thin forwarding surface over the legacy `ICryptoPunksMarket` ABI (`transferPunk`, `offerPunkForSale`, `buyPunk`, `acceptBidForPunk`, etc.). It also exposes owner-only `execute` / `executeBatch` for arbitrary calls.

The ERC721 checklist is largely framed around protocols that *consume* arbitrary third-party NFTs as collateral. Most of those failure modes (burn-on-transfer collateral loss, dual-standard double-counting, fractionalization buyouts, ERC-4494 silent approvals, blacklist-induced liquidation asymmetry) don't apply here because the vault never *uses* a received NFT as collateral and never iterates a third-party collection. The applicable surface is narrower:

- Are the receiver hooks correct and not a vector for reentrancy?
- Does `supportsInterface` advertise the right selectors?
- Does the forwarding `transferPunk(market, ...)` surface expose users to malicious markets?
- Does the `safeTransferFrom`-via-`execute` path or the airdrop-recipient path leak value?

Findings below walk the checklist mechanically; items that don't apply are recorded in the completion table at the end with a short rationale rather than as findings.

---

## Findings

### [N-1] `stash()` reverts on every non-mainnet chain because `STASH_FACTORY` is hardcoded
**Severity**: Low
**Category**: evm-audit-erc721
**Location**: `PunkVault.stash()` — PunkVault.sol:175-183; `STASH_FACTORY` constant — PunkVault.sol:30
**Description**: `STASH_FACTORY` is hardcoded to the canonical Yuga Labs Stash factory address `0x000000000000A6fA31F5fC51c1640aAc76866750`. The vault is otherwise chain-agnostic — `FACTORY` is immutable per-deployment and the punk market is passed as a parameter on every call — so the factory will produce identical vault addresses on any chain where it is deployed at the same address. On chains where the Stash factory is not deployed at the hardcoded address (every L2, every fork chain, every test chain except mainnet), `stash()` will fail.

The exact failure mode depends on the call:
- `IStashFactory(STASH_FACTORY).stashAddressFor(eoaOwner)`: Solidity-level call into a typed interface against an address with no code — Solidity inserts an `extcodesize` check (because the call returns a value) and reverts without a typed error.
- The user perceives this as a generic revert with no context.

This is not a fund-loss issue (the path is owner-or-operator gated and a normal `transferPunk` remains available), but it is a footgun on non-mainnet deployments and means the contract carries a constant that is silently chain-specific.

**Proof of Concept**: Deploy `PunkVaultFactory` on any chain other than Ethereum mainnet; call `PunkVault.stash(market, punkIndex)` as the owner. The call reverts because `0x0…6750` has no code on that chain.

**Recommendation**: Pick one of:
1. Guard the call with an explicit existence check and a typed error, e.g. `if (STASH_FACTORY.code.length == 0) revert StashUnavailable();`. Minimal change, matches the rest of the contract's typed-error style.
2. Make `STASH_FACTORY` a constructor argument on the factory (and a runtime constant baked into the implementation per-deployment) so each deployment can target the canonical Stash address for its chain — or `address(0)` to disable the feature.
3. Document `stash()` as "mainnet only" in the interface NatSpec and revert with a typed `StashUnavailable` error on non-mainnet chains based on `block.chainid`. (Discouraged — couples the impl to a chainid table.)

---

### [N-2] `transferPunk(market, ...)` and sibling forwarders treat `market` as caller-controlled, enabling griefing of operator-controlled vaults
**Severity**: Low
**Category**: evm-audit-erc721
**Location**: `transferPunk`, `offerPunkForSale`, `offerPunkForSaleToAddress`, `punkNoLongerForSale`, `acceptBidForPunk`, `buyPunk`, `enterBidForPunk`, `withdrawBidForPunk`, `stash`, `withdrawFromMarket`, `withdrawFromMarketTo` — PunkVault.sol:103-204
**Description**: Every forwarder on the punk surface accepts an arbitrary `market` address from the caller and forwards a call into it. The vault is the `msg.sender` of those calls, so a malicious `market`:
- can read `tx.origin` and pivot,
- can call back into the vault during `buyPunk` / `acceptBidForPunk` (those don't have a callback in the canonical market, but the caller picks the market — a malicious "punks-compatible market" can reenter),
- can consume the vault's full attached `msg.value` and existing balance via `buyPunk{value:value}` because `value` is also caller-supplied,
- can return arbitrary bytes that don't decode under the expected ABI (for the view-shaped paths there are none, but the call paths return nothing and ignore returndata, so this is muted).

Because the entire surface is gated to `owner-or-operator`, this is **not exploitable by third parties** — it is a self-grief if the owner picks a malicious market, and a way for a compromised operator to drain ETH (which they can already do via `buyPunk` to the canonical market by setting `value = address(this).balance` and naming an attacker-controlled Punk). The operator role is documented as having full ETH-spend authority, so this collapses to "operators are fully trusted, as advertised."

The reentrancy angle deserves note: if a caller-chosen "market" reenters the vault during `buyPunk` it can call any owner-or-operator-gated function as `msg.sender = market` — which only succeeds if that market is itself an operator or the owner. So reentrancy here is fundamentally rate-limited by the auth check; the worst a non-operator malicious market can do is invoke functions that revert.

**Proof of Concept**: An operator calls `vault.buyPunk(maliciousMarket, /*any*/ 0, address(vault).balance)`. The malicious "market" pockets the ETH and does nothing. The owner has now lost the vault balance — but the operator could equivalently call the legitimate market and the operator-as-attacker model already covers this.

**Recommendation**: Document explicitly in the interface that `market` is treated as fully trusted by the caller, and that operators have unbounded ETH-spend authority via any market they name. Optionally maintain an owner-managed allowlist of accepted markets if a future deployment wants narrower operator trust — but this is a design change, not a fix.

---

### [N-3] Implementation accepts ETH via `receive()` but has no path to recover it
**Severity**: Info
**Category**: evm-audit-erc721
**Location**: `PunkVault` constructor + `owner()` guard + `receive()` — PunkVault.sol:53-57, 62-76, 83
**Description**: The constructor sets `_initialized = true` so the implementation can never be co-opted via `factoryInitialize`. `owner()` additionally reverts with `NotClone()` when called on the implementation (because the implementation has no appended immutable args), and every state-changing function on the punk + execute surface either calls `owner()` (which reverts) or checks `_isOwnerOrOperator` which also calls `owner()`. So:
- The implementation's `setOperator`, `transferPunk`, `offerPunkForSale*`, `buyPunk`, `enterBidForPunk`, `withdrawBidForPunk`, `acceptBidForPunk`, `stash`, `withdraw*`, `execute`, `executeBatch` all revert on the bare implementation through `owner()`'s `NotClone` guard.
- `receive()`, `onERC721Received`, `onERC1155Received`, `onERC1155BatchReceived`, `isValidSignature`, and `supportsInterface` remain callable on the implementation directly.

None of those are state-mutating except `receive()`. ETH sent directly to the implementation address is recoverable by nobody (the implementation has no `withdraw` path, and `execute` reverts via `owner()`). Same applies to any NFT a user `safeTransferFrom`s into the implementation — the hooks accept, and there is no sweep path.

**Proof of Concept**: Send 1 wei to `IMPLEMENTATION`. It accepts. No path can move it out.

**Recommendation**: Either guard `receive()` against the bare implementation (`if (address(this) == _SELF) revert NotClone();`) — costs gas on every legitimate clone deposit, marginal — or document explicitly that the implementation address must never be funded. The latter is probably preferable.

---

### [N-4] `withdrawFromMarketTo` forwards ETH via low-level `call` with all-gas; reentrancy is gated by auth but worth noting
**Severity**: Info
**Category**: evm-audit-erc721
**Location**: `PunkVault.withdrawFromMarketTo()` — PunkVault.sol:194-204
**Description**: After pulling the vault's pending withdrawals from the market, the function forwards the delta to `recipient` via `recipient.call{value: withdrawn}("")`. The recipient receives full call gas and can reenter the vault. Every reenterable function is owner-or-operator gated, and the recipient was supplied by the owner-or-operator caller, so:
- If `recipient` is the owner or an operator, reentrancy collapses to "they're calling themselves" — no new authority.
- If `recipient` is a third party, reentry fails the auth check on every state-changing path.

The balance-delta accounting (`balanceBefore` / `withdrawn`) is correctly computed *before* the external `withdraw()` call, so even if the market's `withdraw()` reentered the vault (the canonical market doesn't, but again the market is caller-supplied — see N-2), the delta would be the right number to forward.

No exploitable issue, but the cross-interaction between caller-supplied `market` and caller-supplied `recipient` is a small attack surface that's only safe because the auth gate is "owner-or-operator" on every reachable function.

**Proof of Concept**: n/a — no exploit identified.

**Recommendation**: Optional: add a transient-storage reentrancy guard (the contract targets 0.8.34, transient storage is available) on the spending + withdraw surface. The marginal protection is small but the cost is also small, and it makes the safety argument less dependent on the operator trust model.

---

### [N-5] Receiver hooks accept any token unconditionally — design choice, with a dust/spam tradeoff
**Severity**: Info
**Category**: evm-audit-erc721 (Reentrancy via Callbacks; Airdrops and Breeding)
**Location**: `onERC721Received`, `onERC1155Received`, `onERC1155BatchReceived` — PunkVault.sol:261-287
**Description**: All three hooks are `pure` and return the magic value unconditionally. This is intentional and documented: the vault is a smart account that explicitly wants to receive arbitrary tokens (airdrops, ENS refunds, ERC721/1155 sweeps that the owner can later move via `execute`). Two implications:

1. **Reentrancy via callbacks (checklist item):** The hooks are `pure` — they can't read or write state and can't make external calls. They are therefore not a reentrancy vector when *the vault is the receiver*. The checklist item is about protocols that perform state mutations *after* `safeTransferFrom` calls; the vault doesn't call `safeTransferFrom` itself except via `execute` / `executeBatch`, which are owner-only and have no post-transfer state to corrupt. Not a finding.

2. **Spam / dust / phishing tokens (checklist item "Airdrops and Breeding"):** Accepting any token means a third party can pollute the vault's holdings with worthless or malicious tokens (e.g., scam ERC721s whose `tokenURI` is a phishing link, ERC1155s with adversarial metadata). The owner can ignore or sweep these via `execute`. This is the standard smart-account tradeoff and is the right call here — refusing receipt would block legitimate airdrops.

**Proof of Concept**: Anyone `safeTransferFrom`'s a scam NFT into a vault. It sits there until the owner sweeps it.

**Recommendation**: None. The design is documented in the NatSpec on the hooks and on the contract header. If wallets/UIs displaying vault contents want to filter spam, they should do so at the indexer layer, not at the receiver.

---

### [N-6] `execute` / `executeBatch` allow the owner to call `transferFrom` on third-party ERC721s — recipient-receiver-not-checked footgun
**Severity**: Info
**Category**: evm-audit-erc721 (`transferFrom` doesn't check receiver)
**Location**: `PunkVault.execute()` / `executeBatch()` — PunkVault.sol:209-238
**Description**: `execute` is a generic call surface. If the owner uses it to call `transferFrom(vault, recipient, tokenId)` on a third-party ERC721 (rather than `safeTransferFrom`), and `recipient` is a contract that doesn't implement `IERC721Receiver`, the NFT is permanently stuck at `recipient`. This is checklist item "`transferFrom` doesn't check receiver", but the responsibility lives entirely with the owner constructing the calldata.

The contract itself never calls `transferFrom` on a third-party ERC721 — only `ICryptoPunksMarket.transferPunk`, which is the pre-ERC721 punk-specific call and has different semantics (no receiver hook regardless).

**Proof of Concept**: Owner calls `vault.execute(nft, 0, abi.encodeCall(IERC721.transferFrom, (vault, badContract, id)))`. The NFT lands at `badContract` and may be stuck.

**Recommendation**: None for the contract — the owner is the responsible party. Worth mentioning in a frontend / SDK that wraps `execute`: always default to `safeTransferFrom` for arbitrary ERC721 sweeps.

---

### [N-7] CryptoPunks `offerPunkForSaleToAddress` frontrunning surface inherited as-is
**Severity**: Info
**Category**: evm-audit-erc721 (CryptoPunks legacy)
**Location**: `offerPunkForSaleToAddress()` — PunkVault.sol:117-126
**Description**: Checklist flags: when using CryptoPunks as collateral in a CDP-style protocol, the `offerPunkForSaleToAddress` step (used to atomically hand off a punk in exchange for collateral credit) can be front-run because the punk market doesn't atomically tie offer-to-buyer in a single transaction guarded against reordering — the listing exists in storage between offer and buy, and anyone who is the named `toAddress` can `buyPunk` first.

The vault forwards `offerPunkForSaleToAddress` 1:1 to the market. There is no atomicity added or removed. This is the user's job to handle — if they call `offerPunkForSaleToAddress` and then expect to do something else first before the named buyer takes it, they have the same problem they would calling the market directly. The vault doesn't make it worse.

The interface NatSpec on `offerPunkForSaleToAddress` correctly describes the intended use: setting up real-priced PunkBought round-trips at auction settlement, where the buyer is a trusted protocol that takes immediately.

**Proof of Concept**: n/a — inherited market behavior.

**Recommendation**: None. The integrator using `offerPunkForSaleToAddress` for collateral hand-offs must ensure the named buyer either takes in the same transaction or the listing is otherwise safe to leave open.

---

### [N-8] `supportsInterface` selectors verified correct
**Severity**: Info
**Category**: evm-audit-erc721 (ERC-165 hygiene)
**Location**: `PunkVault.supportsInterface()` — PunkVault.sol:316-322
**Description**: The advertised interface IDs are:
- `type(IPunkVault).interfaceId` — correct.
- `type(IERC721Receiver).interfaceId` (= `0x150b7a02`) — correct.
- `type(IERC1155Receiver).interfaceId` (= `0x4e2312e0`) — correct (XOR of `onERC1155Received` and `onERC1155BatchReceived` selectors, matches OpenZeppelin's IERC1155Receiver).
- `type(IERC1271).interfaceId` (= `0x1626ba7e`) — correct.
- `0x01ffc9a7` (ERC-165 itself) — correct.

No incorrect selectors. The function is `pure`, which is appropriate because the supported set is static.

ERC-1155 spec technically requires receivers to advertise `IERC1155Receiver` via ERC-165 — done. ERC-721 spec doesn't require receivers to advertise `IERC721Receiver` via ERC-165 (only that the magic-value return be correct), but doing so is a strict superset of conformance and is correct here.

**Proof of Concept**: n/a.

**Recommendation**: None. The selectors are right.

---

### [N-9] `factoryInitialize` accepts an unbounded `operators[]` — gas-limit DoS at deploy time
**Severity**: Low
**Category**: evm-audit-erc721 (general)
**Location**: `PunkVault.factoryInitialize()` and `PunkVaultFactory.ensureMyVault()` — PunkVault.sol:243-255; PunkVaultFactory.sol:41-49
**Description**: `ensureMyVault(operators)` forwards `operators` to `factoryInitialize` and iterates without an upper bound. A user passing thousands of operator addresses can OOG their own deploy transaction. This is purely a self-grief — only the user's own vault can be initialized by `ensureMyVault` (`msg.sender` is the salt seed) — and the failure mode is a reverted deploy, not partial state.

Worth pointing out only because clones-with-immutable-args plus per-loop storage write plus per-loop event has nontrivial per-element cost.

**Proof of Concept**: `ensureMyVault(arr)` with `arr.length = 10_000` reverts on intrinsic gas / block gas limit.

**Recommendation**: None required. Optional: document a soft cap in NatSpec ("typically 0-5 operators").

---

## Checklist completion

| # | Item | Applies | Status / Finding |
|---|---|---|---|
| 1 | Simultaneous ERC721 + ERC1155 on same contract | No | Vault doesn't auto-detect or route by `supportsInterface` on external tokens. |
| 2 | Mixed ERC20/ERC721 (ERC404, DN404) | No | Vault doesn't process inbound tokens as collateral; arbitrary tokens are just held until owner sweeps via `execute`. |
| 3 | CryptoPunks don't implement `transferFrom` | Yes | Handled — vault uses the legacy `transferPunk` ABI throughout. Frontrunning of `offerPunkForSaleToAddress` documented at the integrator layer — see **N-7**. |
| 4 | Wrapped NFTs redeemable for originals | No | Vault doesn't use wrapped NFTs as collateral. |
| 5 | `setApprovalForAll` grants access to all collections | No | Vault doesn't call `setApprovalForAll` on third-party NFTs (the owner could, via `execute`, but that's the owner's choice). |
| 6 | `totalSupply` / `ERC721Enumerable` quirks with multi-collection | No | Vault doesn't read `totalSupply` of any NFT. |
| 7 | Large or encoded token IDs | No | Vault doesn't use punk indices in arithmetic; `uint256 punkIndex` is forwarded as-is. |
| 8 | Non-sequential minting | No | Vault doesn't iterate any collection. |
| 9 | Tokens that burn on transfer | No | Vault doesn't accept arbitrary NFTs as collateral and never relies on round-trip ownership. |
| 10 | Conditional self-destruct NFTs | No | Same as 9. |
| 11 | Upgradeable NFT contracts | No | Same as 9. |
| 12 | Pausable NFTs | No | Same as 9. |
| 13 | NFTs with blacklists | No | Same as 9. |
| 14 | `safeTransferFrom` / `safeMint` reentrancy via `onERC721Received` | Yes | Hooks are `pure`, cannot reenter. Vault's own `execute`-mediated `safeTransferFrom` calls are owner-only and have no post-transfer state — see **N-5**, **N-6**. |
| 15 | ERC1155 batch callbacks reentrancy | Yes | Same as 14 — hook is `pure`. See **N-5**. |
| 16 | ERC-4494 NFT permit | No | Vault doesn't track third-party ERC721 approvals; owner manages those via `execute` and is responsible. |
| 17 | Airdrops triggered by holding | Partial | Vault implements `IERC721Receiver` and accepts. See **N-5** for the dust/spam tradeoff. |
| 18 | Fractionalized NFTs | No | Vault doesn't integrate with fractional vaults. |
| 19 | Constructor minting without `Transfer` events | No | Vault doesn't index NFTs via events. |
| 20 | `transferFrom` doesn't check receiver | Partial | Only reachable via owner-supplied `execute` calldata. See **N-6**. |
| 21 | Most `from` params should be `msg.sender` | No | Vault's punk forwarders never let a caller pick `from` — `from` is always `address(this)` (the vault). |

### Additional findings outside the per-item checklist

- **N-1** — `stash()` reverts on every non-mainnet chain (hardcoded `STASH_FACTORY`).
- **N-2** — Caller-controlled `market` parameter (operator-trust artifact; not exploitable by third parties).
- **N-3** — Implementation's `receive()` is unreachable for withdrawal; do not fund the implementation.
- **N-4** — `withdrawFromMarketTo` cross-call between caller-supplied market and caller-supplied recipient (auth-gated, not exploitable).
- **N-8** — `supportsInterface` selectors verified correct (no finding, recorded for completeness).
- **N-9** — Unbounded `operators[]` in `factoryInitialize` (self-grief only).

## Summary

No critical, high, or medium-severity issues identified. The vault's design — a holder-only smart account that forwards a legacy market ABI with a single owner-or-operator auth tier — has a small attack surface, and the largest practical risks (caller-supplied `market`, caller-supplied `recipient`, generic `execute`) are all consistent with the documented trust model. The two concrete recommendations worth acting on:

1. **N-1** — Add a `code.length == 0` guard on `STASH_FACTORY` so non-mainnet deployments fail with a clear typed error rather than an ABI-decode revert.
2. **N-3** — Either gate `receive()` against the bare implementation or document explicitly that the implementation must not be funded.

Everything else is informational or design-as-intended.
