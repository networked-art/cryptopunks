# PunkVault / PunkVaultFactory — ERC-4337 / Smart-Account Checklist Audit

**Date**: 2026-05-13
**Scope**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`

**Checklist**: `https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-erc4337/references/checklist.md`

## Preamble — Applicability

`PunkVault` is **not** a strict ERC-4337 account. It exposes no `validateUserOp`, no EntryPoint integration, no paymaster surface, no bundler/sequencer trust assumptions. It is a "smart account" in the looser sense: a per-user contract wallet with `execute` / `executeBatch`, ERC-1271 signing, operator delegation, and ERC-1167 clone deployment via a deterministic factory.

The 4337-specific items on the checklist (paymasters, `validateUserOp`, EntryPoint stake/unstake, bundler griefing, v0.6 postOp bug, session-key frontend handling) are marked **N/A**.

Items that apply by analogy and were walked carefully:

- Counterfactual deployment / address-binding to credentials (CREATE2 salt)
- Implementation initialization safety
- Direct-execution authorization (the equivalent of "bypassing EntryPoint")
- ERC-1271 cross-account signature replay
- DELEGATECALL vs CALL in `execute`
- Fallback handler self-loops
- ERC-6492 predeploy signature validation by consumers
- Factory-clone storage layout / immutable-arg binding

---

## Findings

## [W-1] ERC-1271 `isValidSignature` does not bind to `verifyingContract`, enabling cross-vault signature replay across sibling vaults with shared keys
**Severity**: Low
**Category**: evm-audit-erc4337
**Location**: `PunkVault.isValidSignature()` — `PunkVault.sol:304-312`
**Description**: `isValidSignature(hash, signature)` forwards `hash` to `SignatureChecker.isValidSignatureNowCalldata(owner(), hash, signature)` without mutating the hash with `address(this)` (e.g., by re-hashing under an EIP-712 domain bound to the vault). The checklist flags this as a known smart-account class issue: signatures produced by a key that controls multiple 1271 wallets backed by the same EOA can be replayed against any of those wallets unless the consumer protocol binds `verifyingContract` itself.

The contract acknowledges this explicitly in NatSpec ("Consumers that don't bind `verifyingContract` themselves may see signatures replay across sibling 1271 wallets backed by the same key — they must bind it to be safe.").

Severity is **Low** rather than Medium because (a) Seaport, Permit2, and SIWE all bind `verifyingContract` in their EIP-712 domain separators, so the predominant integration target is safe; (b) the trade-off is documented and deliberate; (c) the risk only materializes for naive consumers AND requires the user to control multiple vaults that signed unbounded hashes.

**Proof of Concept**: An owner EOA controls `vaultA` (this contract) and `vaultB` (any other 1271 wallet backed by the same EOA, e.g., a Safe owned by the same signer). A naive protocol asks the owner to sign a raw application-defined hash `h` (no EIP-712 domain) and uses `vaultA` as the signer. The owner signs `h`; `vaultA.isValidSignature(h, sig)` returns the magic value. The same `(h, sig)` then validates against `vaultB.isValidSignature(h, sig)` too. Any application call gated only on `(signer, h)` accepts the signature from the wrong vault.

**Recommendation**: Known and deliberate. Mitigate by (1) documenting the constraint in user-facing docs (not only in source NatSpec); (2) optionally exposing a `isValidSignatureDomainBound` variant that wraps `hash` under an EIP-712 domain with `verifyingContract = address(this)`; (3) recommending consumers always bind `verifyingContract` in their EIP-712 domain.

---

## [W-2] Counterfactual signature verifications fail (no ERC-6492 support)
**Severity**: Low
**Category**: evm-audit-erc4337
**Location**: `PunkVault.isValidSignature()` — `PunkVault.sol:304-312`; `PunkVaultFactory.predictVault()`
**Description**: The factory promotes counterfactual safety — `predictVault(user)` returns a stable address before deployment, and the system encourages "counterfactual deposits to `predictVault` before deployment." However, signature consumers that call `vault.isValidSignature(...)` against the predicted address before the vault is deployed will fail — the call hits an empty account and returns no magic value. ERC-6492 was created specifically to handle this case (a wrapper signature that bundles factory + initCode + inner signature so consumers can verify against undeployed wallets).

The latent issue is a UX mismatch: the system advertises counterfactual usage, but anything beyond inbound asset deposits — specifically, getting signatures from the vault before deployment — is impossible without consumer cooperation.

**Proof of Concept**: Off-chain, the owner predicts `vault = factory.predictVault(user)` and signs a message under the standard 1271 flow expecting the relying party to call `vault.isValidSignature(h, sig)`. Before the vault is deployed, the relying party's `isValidSignature` staticcall to `vault` returns success with empty data (call to EOA / undeployed account); strict callers treating an empty return as "not the magic value" reject the signature.

**Recommendation**: Document that counterfactual usage is for inbound asset deposits only; offchain signatures need either a deployed vault, or an ERC-6492-aware verifier. If broader counterfactual signing matters, fold an `ensureMyVault()` step into the signing UX, or have the frontend produce an ERC-6492 wrapper signature.

---

## [W-3] Hard-coded mainnet `STASH_FACTORY` address makes `stash()` a footgun on chains where the Yuga StashFactory is absent
**Severity**: Low
**Category**: evm-audit-erc4337
**Location**: `PunkVault.STASH_FACTORY` (constant) — `PunkVault.sol:30`; `PunkVault.stash()` — `PunkVault.sol:175-183`
**Description**: `STASH_FACTORY` is a Solidity `constant` baked into bytecode at the canonical Yuga Labs mainnet address. If the vault is deployed on an L2 or testnet where that address has no code, `stash()` calls a non-existent contract. Solidity's ABI decoding of the empty return reverts the whole tx. In practice this is safe (calls revert rather than misbehave), but the deployment story for "the same factory address across every chain" (the `_salt` docstring) implies cross-chain usage, and `stash()` is silently broken on every chain that isn't mainnet.

**Proof of Concept**: Deploy `PunkVaultFactory` on Base. A user calls `vault.stash(market, punkIndex)`. Inside, `IStashFactory(0x0000...866750).stashAddressFor(eoaOwner)` is a call to an empty address — Solidity's ABI decoding of the empty return reverts the whole tx. The function is unreachable on every non-mainnet chain.

**Recommendation**: Either (a) wrap the call in a `STASH_FACTORY.code.length != 0` guard and emit a clean `StashUnavailable` error; (b) make `STASH_FACTORY` an immutable set per-deployment (so testnets/L2s with a mirror Stash deployment work); or (c) document explicitly that `stash()` is mainnet-only and the rest of the vault works elsewhere.

---

## [W-4] Asymmetric init path between `ensureVault` and `ensureMyVault` — observability, not security
**Severity**: Info
**Category**: evm-audit-erc4337
**Location**: `PunkVaultFactory.ensureVault()` — `PunkVaultFactory.sol:35-38`; `PunkVault.factoryInitialize()` — `PunkVault.sol:243-255`
**Description**: When a third party calls `ensureVault(user)`, the vault is deployed but `_initialized` remains `false` on the clone (the constructor seals only the impl). Only the factory can call `factoryInitialize`, and the factory only ever does so via `ensureMyVault(msg.sender)` — so the user retains exclusive control of the one-shot operator pre-approval. There is no security violation here.

The latent concern is **observability**: an indexer watching for `OperatorSet` from `factoryInitialize` may not see any event if a third party deployed via `ensureVault` and the user never re-called `ensureMyVault` with operators.

**Proof of Concept**: Attacker calls `ensureVault(victim)` — clone deployed, `VaultDeployed` event emitted, `_initialized` is `false`. Victim later calls `ensureMyVault([op1])` — `_deployIfMissing(victim)` returns the existing clone, `factoryInitialize([op1])` is called, succeeds, emits `OperatorSet`. No griefing.

**Recommendation**: No code change required. Document that `ensureVault(user)` may produce a deployed-but-uninitialized vault, and that an indexer should treat the absence of an `OperatorSet` event in the same tx as `VaultDeployed` as a signal that pre-approval was deferred.

---

## [W-5] `execute` self-call cannot escalate authority — positive confirmation
**Severity**: Info
**Category**: evm-audit-erc4337
**Location**: `PunkVault.execute()` — `PunkVault.sol:209-219`
**Description**: `execute(target, value, data)` is owner-gated and forwards a `CALL` (not `DELEGATECALL`) to `target`. The owner can call `target = address(this)` and pass calldata for any non-owner-only method — but since the caller of the inner call is the vault itself, `msg.sender == address(this)`, which is neither `owner()` nor an approved operator. So a reentrant `execute -> self -> setOperator` reverts with `NotOwner`. The DELEGATECALL ban (CALL only) is the right hardening.

**Proof of Concept**: Owner calls `vault.execute(vault, 0, abi.encodeCall(vault.setOperator, (attacker, true)))`. Inner call: `vault.setOperator(attacker, true)` with `msg.sender == vault`. The check `msg.sender != owner()` triggers `NotOwner` revert. The outer `execute` reverts with `ExecutionFailed`.

**Recommendation**: None. Consider documenting in NatSpec that `execute` cannot grant authority to itself.

---

## [W-6] Operators have unbounded ETH-spend authority via `buyPunk` / `enterBidForPunk` — full trust required at approval time
**Severity**: Info
**Category**: evm-audit-erc4337
**Location**: `PunkVault.buyPunk()` / `enterBidForPunk()` — `PunkVault.sol:143-158`; operator gate via `_isOwnerOrOperator` — `PunkVault.sol:329-331`
**Description**: An approved operator can call `buyPunk(market, punkIndex, value)` or `enterBidForPunk(market, punkIndex, value)` with `value` up to the vault's full ETH balance. Combined with the operator's ability to `transferPunk` the resulting Punk to any address and `acceptBidForPunk` for any minimum price, an operator can fully drain the vault's ETH and its Punks. This is explicitly the design (`IPunkVault.setOperator` NatSpec calls out that the operator role is "strictly stronger" than ERC-721's `setApprovalForAll`), but the trust delegation magnitude warrants a top-line callout for integrators.

The session-key analogue in 4337 wallets typically has spend limits, allow-listed targets, or expirations. This contract has none of those — operators are unconstrained until revoked. The distinct event name `OperatorSet` (rather than `ApprovalForAll`) is a good mitigation against wallets/indexers under-pricing the authority.

**Proof of Concept**: Owner approves `operator` via `setOperator(operator, true)`. Operator calls `vault.enterBidForPunk(maliciousMarket, 1, address(this).balance)` against a market they control that forwards the value to themselves. All vault ETH drained.

**Recommendation**: No code change. Document the trust model prominently in any user-facing wallet UI that surfaces `setOperator`. Optionally consider an `operatorSpendLimit(address operator)` budget in a future version.

---

## [W-7] `setOperator` does not prevent self-approval (operator = `address(this)` or `owner()`)
**Severity**: Info
**Category**: evm-audit-erc4337
**Location**: `PunkVault.setOperator()` — `PunkVault.sol:88-93`
**Description**: The setter rejects `operator == address(0)` but does not block `operator == address(this)` or `operator == owner()`. Neither is harmful — `_isOwnerOrOperator` already short-circuits on `caller == owner()`, and a self-operator approval grants no additional authority because owner already has direct access to every operator path. Mentioned for completeness; the checklist's "fallback handler set to `address(this)`" item is the nearest analog and is N/A here.

**Proof of Concept**: Owner calls `vault.setOperator(vault, true)`. Storage updated, event emitted. `vault.isOperator(vault) == true`. No exploit follows.

**Recommendation**: Optional: reject `operator == address(this)` to avoid the dead-state. Not a security issue.

---

# Checklist Walk

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Factory must use CREATE2 | OK | `PunkVaultFactory._deployIfMissing` uses `Clones.cloneDeterministicWithImmutableArgs`. Salt = `bytes32(uint256(uint160(user)))`. |
| 2 | Factory must return address even if already deployed | OK | `_deployIfMissing` returns the predicted address early if `vault.code.length != 0`. Idempotent. |
| 3 | Attacker deploys wallet with different credentials (salt must include credentials) | OK | Salt is `user`; immutable args = `user` (read by `owner()` via `extcodecopy`). Address-credential binding enforced at both CREATE2 derivation AND bytecode level. A third party calling `ensureVault(victim)` deploys a vault irrevocably owned by `victim`. |
| 4 | Factory stake `unstakeDelay` griefing | N/A | No EntryPoint staking — not a 4337 factory. |
| 5 | Implementation contract initializable by attacker | OK | Constructor sets `_initialized = true` on impl. Additionally, `owner()` reverts (`NotClone`) on the bare impl via `_SELF` check, so every owner-gated entry point reverts there. Multi-layered. |
| 6 | Direct execution bypasses EntryPoint | OK (by analogy) | No EntryPoint exists; `execute` is gated on `msg.sender == owner()` and `owner()` is bound to immutable args in the clone runtime, unspoofable. |
| 7 | `validateUserOp` must return `SIG_VALIDATION_FAILED` | N/A | No `validateUserOp` implemented. |
| 8 | ERC-1271 cross-account signature replay | FINDING | See [W-1]. Acknowledged in code; Low. |
| 9 | `tx.origin` breaks for smart wallets | OK | Vault does not use `tx.origin` in any auth check. (Stash's own `tx.origin == owner` constraint is external and triggered only on the EOA-side flow, not via the vault.) |
| 10 | Fixed gas assumptions (21000 for transfer) | N/A | No hardcoded gas. |
| 11 | VerifyingPaymaster signature replay | N/A | No paymaster. |
| 12 | Cross-chain paymaster replay | N/A | No paymaster. |
| 13 | EntryPoint v0.6 postOp bug | N/A | No EntryPoint integration. |
| 14 | DoS via free transactions | N/A | No paymaster. |
| 15 | Session key exposure on frontend | N/A (contract) | Out of contract scope. The on-chain operator role is the analogue; exposure surface is whatever entity holds the operator key. |
| 16 | Module storage overlap with delegatecall | OK | Vault uses `CALL` only (`execute`, `executeBatch`). No `DELEGATECALL`, no modules, no fallback handler. |
| 17 | Fallback handler set to `address(this)` | N/A | No fallback handler. Vault has `receive()` only, with empty body. |
| 18 | ERC-6492 predeploy signature validation | FINDING | See [W-2]. Consumer-side issue; documented as UX caveat. |

---

# Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Medium   | 0 |
| Low      | 3 (W-1, W-2, W-3) |
| Info     | 4 (W-4, W-5, W-6, W-7) |

No critical or high-severity ERC-4337 / smart-account findings. The contract is not a strict 4337 account; the most relevant items (counterfactual deployment safety, impl init protection, CALL-only `execute`, address-credential binding via CREATE2 + immutable args) are handled correctly. The two Low items on the checklist (ERC-1271 cross-vault replay, no ERC-6492 support) are documented design choices with narrow exploit surface. The environmental Low (W-3) only affects non-mainnet deployments and is a UX/portability concern rather than a fund-loss path.
