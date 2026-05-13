# DoS & Griefing Findings — PunkVault / PunkVaultFactory

**Date**: 2026-05-13
**Auditor**: evm-audit-dos checklist walk
**Scope**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`
**Checklist source**: https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-dos/references/checklist.md

## Preamble

This audit walks the DoS & griefing checklist item-by-item against the two contracts above. The relevant external-call surfaces are:

- Every market function delegates to a caller-supplied `market` address with no allowlist. Markets can therefore be picked by any owner/operator and may be arbitrary code.
- `withdrawFromMarketTo` uses a low-level `call` to the caller-supplied `recipient` and `revert`s with the returned bytes on failure.
- `execute` / `executeBatch` are owner-only and propagate `bytes memory ret` from the target through `revert ExecutionFailed(ret)`.
- `stash` calls a hard-coded `STASH_FACTORY` (Yuga's canonical StashFactory).
- `factoryInitialize` loops over an `address[]` of operators (one-shot, size bounded by whatever the user passes through the factory).
- `executeBatch` loops over a caller-supplied `Call[]` (owner-only).

Trust model: the vault has two privilege tiers — `owner` (lifelong, baked into immutable args) and `operator` (set by the owner). Both tiers already hold full ETH-spend authority via `buyPunk` / `enterBidForPunk`, so any DoS they can self-inflict is out of scope for this checklist; this audit focuses on griefing by third parties or by the supplied external addresses (`market`, `recipient`, `target` in `execute*`).

---

## [D-1] Return-data bombing from hostile `market` / `target` / `recipient`
**Severity**: Low
**Category**: evm-audit-dos
**Location**: `PunkVault.execute()` L215-218, `PunkVault.executeBatch()` L230-237, `PunkVault.withdrawFromMarketTo()` L201-202, and every delegated market call (L105, L113, L124-125, L131, L137, L148, L157, L163, L182, L190, L198)
**Description**: All external calls in `PunkVault` use the high-level Solidity `.call(...)` form (or a typed interface call), which copies the entire return-data buffer to memory regardless of size. On failure paths (`execute`, `executeBatch`, `withdrawFromMarketTo`) the returned bytes are re-bubbled via `revert ExecutionFailed(ret)` — that re-emits the full buffer through ABI-encoding, doubling the memory pressure. A malicious `target`, `market`, or `recipient` can `return`/`revert` with megabytes of data, making the call run out of gas via quadratic memory expansion cost.
**Proof of Concept**:
```solidity
contract Bomb {
    fallback() external payable {
        assembly { return(0, 5000000) }   // 5MB return — quadratic memory cost in caller
    }
}
```
- `vault.execute(bomb, 0, "")` succeeds inside `Bomb` but the return copy in the vault frame consumes tens of millions of gas — exceeds block gas limit, transaction reverts.
- A hostile `market` in any delegated function (e.g. `transferPunk`) can pull the same trick from the failure path: revert with 5MB of data, the vault rewraps it into `ExecutionFailed(ret)` and burns memory gas.
- For `withdrawFromMarketTo`, a recipient whose `receive()` reverts with a huge buffer triggers the bubble.

**Impact**: The caller wastes their own gas; the vault state is not corrupted. Every entrypoint that touches an untrusted address is gated to `owner` or `operator`, so the only third parties who can trigger this are addresses the owner has already given full ETH-spend authority to — i.e. self-inflicted. Logging as **Low** because the pattern is real and would matter immediately if the trust model ever loosened (e.g. a "permissionless filler" operator role) and because it's cheap to mitigate.

**Recommendation**: Wrap the three return-data sites in inline assembly that bounds the copied size:
```solidity
assembly {
    let ok := call(gas(), target, value, add(data, 0x20), mload(data), 0, 0)
    let n := returndatasize()
    if gt(n, 0x200) { n := 0x200 }   // cap at 512 bytes
    returndatacopy(0, 0, n)
    if iszero(ok) { revert(0, n) }
    return(0, n)
}
```
Alternatively drop `ret` from `ExecutionFailed` and use a parameterless error — traces still show the original revert on the inner frame.

---

## [D-2] `executeBatch` is atomic-on-failure and propagates revert data
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `PunkVault.executeBatch()` L230-237
**Description**: Any single sub-call reverting (including a return-data bomb, D-1) kills the entire batch and bubbles that sub-call's returndata through `ExecutionFailed`. This is the documented "all-or-nothing" semantic, and `executeBatch` is owner-only — so it cannot be weaponised by a third party. Worth flagging because the failure-mode is asymmetric with the ordering of the calls: if the owner is convinced to include a hostile `target` in position N of a batch, every preceding call's effect is rolled back. Standard smart-account behaviour.
**Proof of Concept**: Owner builds a 50-call batch ending with a call into a contract that reverts; the 49 prior calls are reverted with it.
**Recommendation**: No code change required. Consider adding a tolerant variant (`tryExecuteBatch` returning per-call success flags) if a non-atomic semantic is desired in future. Documentation-only otherwise.

---

## [D-3] `factoryInitialize` loops over caller-controlled `operators`
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `PunkVault.factoryInitialize()` L243-255 and `PunkVaultFactory.ensureMyVault()` L41-49
**Description**: `factoryInitialize` runs a single linear loop over the `operators[]` array passed from `ensureMyVault`. The caller of `ensureMyVault` is `msg.sender` (also the vault's owner), so array size is set by the same party paying the gas. No third party can pad the array or trigger the loop. One-shot — guarded by `_initialized`. No external calls inside the loop, only mapping writes and an `emit`. No DoS.
**Proof of Concept**: N/A — the only "victim" of a too-large `operators` array is the user who chose to pass it.
**Recommendation**: None. Optionally cap `operators.length <= 32` as defense-in-depth.

---

## [D-4] Force-fed ETH does not corrupt `withdrawFromMarketTo` accounting
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `PunkVault.withdrawFromMarketTo()` L194-204
**Description**: The function uses the classic balance-diff pattern (`balanceBefore` → `market.withdraw()` → `balanceAfter - balanceBefore`). Walked both force-feed directions:

- **Force-feed before the call**: pre-existing ETH is included in `balanceBefore` and in the post-call balance — it cancels out, `withdrawn` equals exactly what `market.withdraw()` paid. No-op.
- **Force-feed during the call (reentrant)**: `SELFDESTRUCT` (post EIP-6780) cannot be reliably used to push ETH mid-call unless the market explicitly spawns a self-destructing contract aimed at the vault — extremely contrived. A reentrant call back into `withdrawFromMarketTo` would observe its own balance window over a different market and forward marginal proceeds; no double-counting because the same external balance is the upper bound on any single `market.withdraw()` payout.

Function is resilient. Recorded because the pattern is a known footgun.
**Proof of Concept**: Attacker self-destructs a 1-ETH contract at the vault. Owner calls `withdrawFromMarketTo` later: `balanceBefore = 1`, market pays 2 ETH, `balanceAfter = 3`, `withdrawn = 2`. The 1 ETH stays in the vault, the owner pockets the correct withdrawal. No corruption.
**Recommendation**: None.

---

## [D-5] `stash` depends on a hard-coded external factory
**Severity**: Info
**Category**: evm-audit-dos
**Location**: `PunkVault.stash()` L175-183, `STASH_FACTORY` constant L30
**Description**: `stash` calls `STASH_FACTORY.stashAddressFor(eoaOwner)` and conditionally `STASH_FACTORY.deployStash(eoaOwner)`. The address is hard-coded (`0x000000000000A6fA31F5fC51c1640aAc76866750`, Yuga's canonical StashFactory) and cannot be changed. If StashFactory is ever paused, selfdestructed, or behaves unexpectedly, `stash` becomes permanently unusable on every vault. Not an attacker-driven DoS — a censorship/availability dependency on a third-party deployer.

The owner has a fallback: `execute(market, 0, transferPunkCalldata)` or direct `transferPunk(market, idx, stashAddr)`. Impact is mostly cosmetic — the convenience method breaks; the ability to move punks does not.
**Proof of Concept**: Yuga deprecates StashFactory → `stashAddressFor`/`deployStash` revert → every vault's `stash()` is dead weight. Owners pivot to `execute()` or `transferPunk()`.
**Recommendation**: Either (a) accept the dependency and document the fallback in `stash`'s NatSpec, or (b) wrap the two stash-factory calls in try/catch and surface a typed `StashFactoryUnavailable` error so callers know to use the fallback. (a) is acceptable.

---

## [D-6] No reentrancy guards across the spending / withdrawal surface
**Severity**: Info
**Category**: evm-audit-dos
**Location**: All of `PunkVault` (no `nonReentrant` modifier anywhere)
**Description**: Every state-changing entry point hands control to a caller-supplied or user-supplied external address (`market`, `recipient`, `target`). No `nonReentrant` modifier. For *DoS purposes*: a reentrant call could amplify a return-data bomb (D-1) or re-enter `withdrawFromMarketTo` mid-flight (covered under D-4).

The vault holds no per-call accounting state (no balances mapping, no checks-effects-interactions invariant beyond D-4). Operator/owner authority is the same on re-entry as on entry. Reentrancy is a non-issue *for DoS purposes* — flagging because it's the kind of pattern the checklist asks about, and "we walked it" is the right artefact.
**Proof of Concept**: A hostile `market` calls back into `vault.withdrawFromMarketTo(otherMarket, attacker)` during its own `withdraw()`. The reentrant call only succeeds if the caller is already an operator — i.e. one of the very few addresses the owner has fully trusted. No new authority is gained.
**Recommendation**: None for DoS. (If reentrancy is in scope for a broader audit, consider `nonReentrant` on `withdrawFromMarketTo` to retire the balance-diff edge case from D-4 entirely.)

---

## Checklist completion

| # | Checklist item | Status | Findings |
|---|----------------|--------|----------|
| 1 | Returndata bombing via external calls | Walked, finding | D-1 |
| 2 | Insufficient gas forwarding (SWC-126) | Walked, N/A | No `.call{gas: X}()` with a fixed gas budget anywhere; every call forwards all remaining gas. |
| 3 | Try/catch always fails with insufficient gas | Walked, N/A | No `try/catch` in either contract. |
| 4 | User-growable arrays iterated in a loop | Walked, finding | D-3 (one-shot, owner-controlled, info only). Operators are stored in a `mapping`, never iterated. |
| 5 | External calls inside loops | Walked, N/A | Only `executeBatch` makes external calls in a loop, owner-only with revert-on-fail by design (D-2). `factoryInitialize` loop contains no external calls. |
| 6 | L2 cheap-gas array-filling | Walked, N/A | No unbounded user-fillable array. `predictVault`/`ensureVault` are idempotent per-user, not arrays. |
| 7 | ETH receiver with reverting fallback | Walked, finding | D-1 (return-data bomb via recipient). The vault never silently swallows a reverting recipient — it bubbles via `ExecutionFailed`. |
| 8 | Token transfer to blocklisted address | Walked, N/A | No batch token distribution; the vault only transfers tokens via explicit `execute`. |
| 9 | Zero-amount transfer reverts | Walked, N/A | `withdrawFromMarketTo` explicitly skips the `recipient.call` when `withdrawn == 0`. |
| 10 | Block stuffing to prevent time-sensitive actions | Walked, N/A | No deadlines, auctions, liquidation windows, or grace periods. |
| 11 | Timelock-based griefing at no cost | Walked, N/A | No timelock. |
| 12 | Front-running liquidation griefing | Walked, N/A | No liquidation surface. |
| 13 | Account abstraction DoS via free paymaster | Walked, N/A | No paymaster integration. ERC-1271 is signature-only; no gas subsidy. |
| 14 | Pausing liquidations creates solvency risk | Walked, N/A | No pause mechanism. |
| 15 | Pause can brick contract | Walked, N/A | No pause mechanism. (External dependency D-5 is the only availability risk.) |
| 16 | Chainlink multisig blocking price feed | Walked, N/A | No price feed / oracle integration. |
| 17 | `balanceOf()` reverting causes DoS | Walked, N/A | `address(this).balance` is a native opcode and cannot revert (D-4 covers the related balance-diff concern). No ERC20 `balanceOf` calls. |

### Beyond-checklist items walked

| Item | Result |
|------|--------|
| Selfdestruct force-feeding into balance-diff accounting | D-4 (resilient) |
| Hard-coded external dependency (StashFactory) | D-5 (info) |
| Reentrancy as a DoS amplifier | D-6 (info) |
| Owner-only batched-call atomicity | D-2 (info) |
| Receiver hooks (ERC721/1155) as gas-saturation vector | N/A — pure, return selector only |
| `factoryInitialize` re-entry / re-init | N/A — `_initialized` flag set in constructor on impl and set in function before mapping writes; no external calls in loop |

### Summary

- 0 Critical / 0 High / 0 Medium
- 1 Low (D-1, return-data bombing, gated behind owner/operator trust)
- 5 Info (D-2 through D-6)
