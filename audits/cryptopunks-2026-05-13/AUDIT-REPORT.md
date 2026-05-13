# PunkVault & PunkVaultFactory — Audit Report

**Date**: 2026-05-13
**Auditor**: ethskills/evm-audit pipeline (8 parallel Opus checklist agents)
**Scope**:
- `contracts/contracts/PunkVault.sol`
- `contracts/contracts/PunkVaultFactory.sol`

**Solidity**: `0.8.34` · **OpenZeppelin Contracts**: `5.6.1` · **Target**: any CryptoPunks-compatible market on any EVM chain.

**Checklists walked**: `general`, `proxies`, `signatures`, `assembly`, `erc721`, `access-control`, `dos`, `erc4337` (smart-account). Per-checklist files: `findings-*.md`.

---

## Executive summary

The contracts implement a deterministic, per-user smart account for CryptoPunks custody. Each user gets one ERC-1167 clone with the owner address baked into immutable args. Owner-or-operator gates the punk surface; owner-only gates `execute` / `executeBatch`. The implementation is sealed against initialisation; clones inherit `FACTORY` through delegatecall; `execute` uses `CALL` only (never `DELEGATECALL`). The design eliminates whole classes of vulnerability (upgrade bugs, storage collisions, metamorphic CREATE2, internal-accounting bugs, paymaster griefing) by construction.

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | — |
| High | 1 | S-1 |
| Medium | 3 | S-2, AC-1, AC-2 |
| Low | 10 | S-3, S-4, N-1, AC-3, AC-4, AC-5, G-1 (=A-1=D-1), G-3, G-4, W-2 |
| Info | many | see per-checklist files |

The single material risk — **S-1 / cross-chain ERC-1271 signature replay** — stems from combining a deterministic same-address-on-every-chain vault with a raw passthrough 1271. Two of the three Mediums (S-2, AC-1) are explicitly intentional in the source NatSpec; surfacing them here as Medium reflects the gap between code-level disclosure and what naive integrators will assume. AC-2 (no key-rotation) is structural — the appropriate mitigation is "back the vault with a smart-account owner", not a contract change.

No fund-loss path exists against a non-malicious owner and non-malicious operators.

---

## Cross-cutting concerns

### CC-1 — The vault's address parity across chains is its biggest asset *and* its biggest liability.
The factory derives the per-user vault address from `CREATE2(factory, salt=user, initcodeHash(impl, user))`. If `PunkVaultFactory` is deployed at the same address on every chain (the doc explicitly markets this), so are all users' vaults. That's great for counterfactual deposits but terrible for ERC-1271 because the contract never binds `block.chainid` or `address(this)` into the validated hash (S-1). It also means cross-chain parity depends on the factory's deploy-time nonce being `1` on every chain — a deploy-script invariant (G-3).

### CC-2 — Operator is a full-trust role that visually resembles a narrower one.
The interface NatSpec on `setOperator` calls operator "strictly stronger than ERC-721's `setApprovalForAll`" and explains the ETH-spend authority. But operators can name *any* address as `market` in `buyPunk`/`enterBidForPunk`/`withdrawFromMarketTo` (AC-1, W-6, N-2), which means an operator is effectively a session key with unbounded scope and no spend limit. The distinct event name `OperatorSet` is a partial mitigation; documenting prominently in the dApp UI is the rest.

### CC-3 — `execute` propagates large untrusted returndata through a custom error.
Three call sites — `execute`, `executeBatch`, `withdrawFromMarketTo` — capture full returndata into a `bytes memory` via Solidity's `.call` and bubble it through `revert ExecutionFailed(ret)` (G-1, A-1, D-1). Caller is owner-or-operator, so the only victim is the caller themselves, but the fix is cheap inline-assembly. Cap the captured bytes or assembly-call with a discarded buffer on success.

### CC-4 — Reentrancy is auth-gated, not guarded.
No `nonReentrant` anywhere. Each entry point hands control to a caller-supplied external address. Reentry succeeds only when the reentrant caller has owner/operator status, so the safety argument is "the operator role is full-trust anyway." Approving a *contract* as operator (a realistic marketplace integration) means that contract's callback can exercise the full operator surface in the same tx (AC-5). Trust an operator contract not just to behave as a counterparty but to behave as your delegate during its own callbacks.

---

## Findings (ranked)

### [S-1] Cross-chain ERC-1271 signature replay across deterministic vault addresses
**Severity**: High
**Location**: `PunkVault.isValidSignature()` (PunkVault.sol:304-312); `PunkVaultFactory._salt` (PunkVaultFactory.sol:55-71)

`isValidSignature` forwards `hash` directly to `SignatureChecker.isValidSignatureNowCalldata(owner(), hash, signature)` without any EIP-712 wrapping. Combined with the deterministic factory salt and `IMPLEMENTATION` baked into clone initcode, the same user's vault sits at the same address on every chain where the factory is deployed at the same address. Consumers that don't bind `chainId` in their EIP-712 domain (Seaport and Permit2 do; a long tail of SIWE/Snapshot/custom consumers don't) will validate a mainnet-signed hash against the user's Base vault. The natspec discloses the *same-chain sibling-wallet* replay (S-2 below) but not cross-chain.

**Recommendation**: Adopt **ERC-7739 nested EIP-712 wrapping** — OZ ships `draft-ERC7739` in v5.6.1 already in the dep tree. It rewraps the consumer's hash under the vault's own domain (binding `verifyingContract` + `chainId`) while remaining compatible with Seaport / Permit2 which pre-hash with their own domain. Single import, replaces `isValidSignature`. Resolves S-1 and S-2 simultaneously.

Alternatives: bind `block.chainid` into the factory salt (trades the "same address on every chain" promise for replay safety), or refuse raw `bytes32` hashes that don't begin with `\x19\x01` / `\x19Ethereum Signed Message:\n`.

---

### [S-2] Same-chain sibling-wallet ERC-1271 replay
**Severity**: Medium
**Location**: `PunkVault.isValidSignature()` (PunkVault.sol:304-312)

The natspec at 299-303 already discloses this: any other 1271 wallet backed by the same key (a Safe, a 4337 account, an EIP-7702 delegate) on the same chain validates the same `(hash, sig)` pair. Consumers that don't bind `verifyingContract` can be tricked into accepting a vault-A signature against sibling wallet B. Disclosure is reasonable but doesn't substitute for proper binding by the long tail of consumers.

**Recommendation**: Same as S-1 — ERC-7739 wrapping fixes this as a side-effect.

---

### [AC-1] Operator can drain the vault's full ETH balance through an attacker-controlled "market"
**Severity**: Medium
**Location**: `PunkVault.buyPunk()` (143-149); `PunkVault.enterBidForPunk()` (152-158); also W-6, N-2

Both functions are operator-gated and forward `value` wei to an operator-supplied `market` address with no allow-list. `market` need not be the canonical CryptoPunks market — any contract with a payable fallback works. An operator can call `vault.buyPunk(maliciousMarket, 0, address(this).balance)` and route the full ETH balance to themselves with no Punk in exchange.

The interface NatSpec discloses *that operators can spend ETH via buyPunk/enterBidForPunk*, but does not emphasise that operators also pick the destination. A reasonable reader of "spend ETH on buyPunk" assumes a Punk is acquired in exchange.

**Recommendation**: Pick one — (a) tighten the natspec on `setOperator` to make "operator chooses the destination market" explicit, (b) maintain an owner-managed market allow-list inside the vault and gate the spend surface on it, or (c) introduce a separate `spendOperator` role distinct from the punk-management role. (a) is sufficient if the user-facing wallet UI surfaces the warning at approval time.

---

### [AC-2] No owner key rotation, transfer, or recovery
**Severity**: Medium
**Location**: `PunkVault.owner()` (62-76); contract-wide

`owner()` is the clone's immutable arg — no setter, no transfer, no renounce, no factory-mediated migration. Loss of the owner EOA is terminal: punks are accessible only through an already-approved operator's rescue (and even then operators cannot call `execute`, so non-punk assets — ERC20 airdrops, ENS names — are lost forever). A compromised owner key has no defence except racing the attacker.

This is structural, not a code bug, but Medium-rated because the disclosure surface is asymmetric: the vault advertises itself as a smart account but lacks the recovery/rotation features users expect of one.

**Recommendation**: Document in the `IPunkVault` natspec that the vault is permanently bound to its owner — and therefore should be owned by an account with its own recovery surface (Safe, ERC-4337 account, EIP-7702 delegated EOA). Optionally implement an opt-in factory-mediated migration (owner-signed authorisation, factory deploys a new clone, batch-transfers assets via `execute` on the old vault).

---

### Low — actionable

- **[N-1 / W-3]** `STASH_FACTORY` is hard-coded to the canonical Yuga mainnet address. `stash()` reverts on every non-mainnet chain because `0x000000000000A6fA31F5fC51c1640aAc76866750` has no code there. The rest of the vault is chain-portable. **Fix**: guard the call with `if (STASH_FACTORY.code.length == 0) revert StashUnavailable();` for a clean typed error; or make it a per-deployment immutable. Owner still has `transferPunk` as a fallback path.

- **[G-1 / A-1 / D-1]** Return-data bombing in `execute`, `executeBatch`, `withdrawFromMarketTo`. Solidity's `.call` returning `(bool, bytes memory)` does an unbounded `returndatacopy`; a malicious target returns megabytes, vault burns memory-expansion gas. Auth-gated so impact is "caller burns their own gas", but the inline-assembly fix is small (4 KB cap on captured bytes, or discard returndata entirely on success in `withdrawFromMarketTo`). Recommended for the proceeds path at minimum.

- **[G-3]** Cross-chain implementation-nonce parity is a deploy-script invariant. The factory's inner `new PunkVault(this)` must land at nonce 1 on every chain; if the deployer is a contract that does anything between deploy and the constructor's inner CREATE, the impl address — and therefore every clone's address — diverges from mainnet. **Fix**: deploy the implementation separately via CREATE2 from the same deterministic deployer and pass its address into the factory constructor — removes the nonce dependency entirely. Or add a deploy-time assertion across chains.

- **[G-4]** `isOperator(owner())` returns `false` even though the owner has strictly more authority than any operator. Indexers/dashboards may under-display the owner's rights, and a Seaport-class integrator that pre-checks "is caller operator on seller's vault?" will refuse the owner's own listings. **Fix**: fold the owner into the answer (`return operator == owner() || _operatorApproved[operator];`) — matches `_isOwnerOrOperator`. Or rename to `isApprovedOperator`.

- **[AC-3]** `factoryInitialize` and `setOperator` emit the same `OperatorSet(op, approved)` event. Indexers cannot distinguish a one-shot factory bootstrap from an owner-driven approval. **Fix**: emit a distinct `OperatorInitialized(operator)` from `factoryInitialize`. Cosmetic but preserves the deliberate event-naming intent.

- **[AC-4]** `ensureMyVault([ops])` semantics: second call reverts with `AlreadyInitialized` instead of falling through. The `ensure*` name implies idempotency, which holds for the deploy half but not the init half. **Fix**: rename to `deployVaultWithOperators`, or guard the `factoryInitialize` call so an already-initialised vault no-ops the init half.

- **[AC-5]** Approving a *contract* as operator gives that contract full operator authority *during its own callbacks* into the vault. The safety argument relies on "operators are full-trust anyway". **Fix**: add a single `nonReentrant` (OZ `ReentrancyGuardTransient` is one slot in 0.8.34) on every operator-gated function, or amend `setOperator` natspec to explicitly warn that a contract operator can re-enter and exercise the full surface.

- **[S-3]** Owner-is-contract: 1271 trust transitively follows the owner's logic, including future upgrades and EIP-7702 delegations. A 7702-delegated EOA whose program returns `0x1626ba7e` unconditionally turns the vault into a wildcard signer. The owner is bound for life — no recovery if the owner's 1271 logic deteriorates. **Fix**: add a natspec caveat — no code change required if the "trust the owner's 1271" model is intended.

- **[S-4]** Unbounded `signature` length forwarded into a contract owner's `isValidSignature` with all gas. A malicious owner contract can grief 1271 consumers. The vault is not the victim; consumers should gas-cap their staticcalls. Informational, optional 4 KB cap on signature length.

- **[W-2]** Counterfactual signatures fail without ERC-6492. The system advertises counterfactual address usage, but a relying party that staticcalls `isValidSignature` against an undeployed vault gets no magic value back. **Fix**: document counterfactual usage as "inbound asset deposits only", or have the dApp produce ERC-6492 wrapper signatures for the predeploy window.

---

### Info — selected design notes

- **CALL-only `execute`**: confirmed safe. Owner cannot escalate authority via `execute(this, …)` because `msg.sender == address(this)` is neither owner nor operator (W-5).
- **Implementation sealing**: `_initialized = true` in the constructor, plus `owner()`'s `NotClone` revert on the bare impl, plus `factoryInitialize` gated on `msg.sender == FACTORY` — defence-in-depth, correctly applied (AC-7, A-2, G-7).
- **`extcodecopy` math**: `0x2d` offset matches OZ's `Clones.fetchCloneArgs`; `memory-safe` annotation valid; `shr(96, …)` cleans upper bits; clones have no constructor so no construction-time race (A-4, A-5).
- **CREATE2 metamorphism**: closed by construction — no `SELFDESTRUCT` in `PunkVault`, the 1167 stub, or the factory (P-1, A-6).
- **`ensureVault(user)` is intentionally permissionless**: a third-party deploy produces an empty, user-owned vault; the user's `ensureMyVault([ops])` still works because `_initialized` is per-clone (P-2, W-4, AC-8).
- **Receiver hooks unconditional**: deliberate for a smart account; the dust/spam tradeoff is correct (N-5).
- **Force-fed ETH does not corrupt `withdrawFromMarketTo`**: balance-diff math is resilient to selfdestruct-pushed ETH (D-4).
- **`executeBatch` aliases `msg.value` across iterations** (G-2): owner-only, by design (vault funds spends from its own balance alongside attached `msg.value`).
- **`Executed(target, value, data)` event emits full calldata** (G-6): owner-only log-bomb; switch to `keccak256(data)` if any indexer cares about log size.
- **PUSH0 in 0.8.34**: pin `evmVersion` to `paris` if any target chain pre-dates Shanghai (G-8). Every major L1/L2 today supports PUSH0.

---

## Recommended actions, ranked by leverage

1. **Adopt ERC-7739 wrapping** in `isValidSignature` (OZ `draft-ERC7739`, already in deps). Resolves S-1 + S-2 + S-3-related disclosure in one change. (High-priority.)
2. **Guard `STASH_FACTORY` existence** (`code.length == 0` check → typed error). Cheap, makes non-mainnet deploys honest. (N-1 / W-3, Low.)
3. **Cap returndata in `execute` / `executeBatch` / `withdrawFromMarketTo`** with inline assembly. Or discard returndata on success in `withdrawFromMarketTo`. (G-1, Low.)
4. **Fold owner into `isOperator`** — `return operator == owner() || _operatorApproved[operator];`. One-line behavioural fix. (G-4, Low.)
5. **Sharpen the `setOperator` natspec** to make explicit that operators choose the destination `market` and that approving a contract grants reentry-time authority across the operator surface. (AC-1 + AC-5, doc-only.)
6. **Document the owner-rotation absence** prominently in `IPunkVault.owner`. Recommend backing the vault with a Safe / 4337 / 7702 account. (AC-2, doc-only.)
7. **Deploy the implementation via CREATE2 from a deterministic deployer**, pass its address to the factory constructor. Removes the nonce dependency for cross-chain parity. (G-3, deploy-only.)
8. **Distinct `OperatorInitialized` event** from `factoryInitialize`. (AC-3 / P-3, optional.)

Everything else is informational.

---

## Per-checklist file index

| Checklist | Findings count | File |
|---|---|---|
| general | 8 (3 Low, 5 Info) | `findings-general.md` |
| proxies | 3 (Info only) | `findings-proxies.md` |
| signatures | 8 (1 High, 1 Medium, 2 Low, 4 Info) | `findings-signatures.md` |
| assembly | 9 (1 Low, 8 Info) | `findings-assembly.md` |
| erc721 | 9 (3 Low, 6 Info) | `findings-erc721.md` |
| access-control | 10 (2 Medium, 3 Low, 5 Info) | `findings-access-control.md` |
| dos | 6 (1 Low, 5 Info) | `findings-dos.md` |
| erc4337 | 7 (3 Low, 4 Info) | `findings-erc4337.md` |
