# PunkVault — Signatures Audit Findings

**Date**: 2026-05-13
**Auditor**: evm-audit-signatures pass
**Scope**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`

**Checklist**: https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-signatures/references/checklist.md
**Solc**: 0.8.34
**OZ version**: `@openzeppelin/contracts@5.6.1` (SignatureChecker last updated v5.6.0, ECDSA v5.6.0)

## Preamble

`PunkVault` exposes exactly one signature surface: ERC-1271 `isValidSignature(bytes32 hash, bytes calldata signature)` at PunkVault.sol:304-312. It calls `SignatureChecker.isValidSignatureNowCalldata(owner(), hash, signature)`, where `owner()` is read from immutable clone args (bound for life, no rotation possible).

The contract is intentionally a "passthrough signer" for Seaport, Permit2, SIWE, Snapshot, and similar consumers. By design:

- `hash` is not wrapped with any EIP-712 domain — the vault has no `DOMAIN_SEPARATOR`, no nonce, no deadline.
- The vault is counterfactually deterministic: salt = user address, `IMPLEMENTATION` baked in at factory deploy time -> if the factory is deployed at the same address on chain A and chain B, every user's vault address is identical on both chains.
- The owner key is unrotateable for the lifetime of the clone.

This shape is deliberate (the natspec at lines 299-303 calls out the cross-1271-sibling-wallet replay caveat), but the absence of EIP-712 wrapping means the whole signature security model is shifted onto consumers. Many real-world consumers do not, in fact, bind `verifyingContract`. The findings below judge whether the disclosure is sufficient.

The ECDSA library underlying `SignatureChecker` is current (OZ v5.6.0): malleability is rejected by enforcing `s` in lower half-order (ECDSA.sol:185), and `ecrecover` returning `address(0)` is properly translated to a `RecoverError.InvalidSignature` (ECDSA.sol:190-193). Length validation rejects everything but 65-byte sigs. The ECDSA primitives are not a source of risk here; risk lives in the application-level signing surface.

`PunkVaultFactory.sol` has no signature surface of its own and is implicated only because it makes the vault address chain-portable.

---

## [S-1] ERC-1271 signatures replay across every chain the factory is deployed on
**Severity**: High
**Category**: evm-audit-signatures
**Location**: `PunkVault.isValidSignature()` PunkVault.sol:304-312; `PunkVaultFactory._deployIfMissing` / `_salt` PunkVaultFactory.sol:55-71
**Description**:
`isValidSignature` forwards `hash` to `SignatureChecker.isValidSignatureNowCalldata(owner(), hash, …)` unwrapped. Because the factory salts the clone with the user's address (`_salt(user) = bytes32(uint256(uint160(user)))`) and the `IMPLEMENTATION` is created by `new PunkVault(address(this))` (so it depends only on the factory address, the factory's deployment nonce — always 1 for the runtime-created impl — and the factory's bytecode), the same user's vault sits at the same address on every chain where this factory is deployed at the same address. The factory's natspec at lines 12-15 sells this as a feature.

The vault carries no chain-id binding of any kind in its signature path. Consumers that check `signer == vault && signer.isValidSignature(hash, sig) == 0x1626ba7e` and rely on the signed payload alone for cross-chain isolation will replay across chains.

Concretely:
1. Seaport binds `chainId` in its own domain -> safe.
2. SIWE / Snapshot / custom 1271-consuming protocols that don't bind `chainId` -> replay across chains.
3. Permit2 binds `chainId` -> safe.

This is the "Missing chain ID" / "Missing `address(this)`" checklist items. The natspec at lines 299-303 discloses the sibling-wallet (same chain, different vaults) replay, but NOT the cross-chain replay, which is strictly stronger.

**Proof of Concept**:
```
Setup: Factory deployed at 0xF on mainnet AND on Base. Alice has vault 0xV on both.
Vulnerable consumer: AcmeMarket builds hash = keccak256(abi.encode(orderType, asset, price, expiry)). No chainId binding.

1. Alice signs AcmeMarket sell-order hash H on mainnet. Order executes; mainnet Punk sold.
2. Same hash H presented to AcmeMarket-Base by attacker.
3. AcmeMarket-Base calls 0xV.isValidSignature(H, sig) on Base.
4. Vault forwards to owner (Alice EOA) — ecrecover returns Alice.
5. AcmeMarket-Base executes sale of Alice's Base-vault Punk to attacker.
```

**Recommendation**:
Option A (preferred) — adopt ERC-7739 nested EIP-712 wrapping. OZ ships `draft-ERC7739` in v5.6.1 (already in the dependency tree). It rewraps the consumer's hash under the vault's own EIP-712 domain (with `verifyingContract` and `chainId`) while remaining valid against Seaport/Permit2 because they pre-hash with their own domain. This is the standard fix for "smart account that wants to participate in 1271 ecosystems without inheriting their domain mistakes":

```solidity
// inherit OZ ERC7739; isValidSignature delegates to _erc7739IsValidSignature
// which performs nested-typed-data unwrapping + ECDSA/1271 forwarding.
```

Option B — narrow disclosure: extend the natspec to call out cross-chain replay explicitly, and/or include `block.chainid` in the factory salt to break address portability across chains. Trades the "same vault address everywhere" UX promise for replay safety.

Option C — refuse raw `bytes32` hashes that don't begin with `\x19\x01` (EIP-712) or `\x19Ethereum Signed Message:\n`. Narrows surface but does not by itself prevent replay if the wrapped payload omits `chainId`.

---

## [S-2] ERC-1271 sibling-wallet replay (same key, same chain, different vault product)
**Severity**: Medium
**Category**: evm-audit-signatures
**Location**: `PunkVault.isValidSignature()` PunkVault.sol:304-312
**Description**:
The case the natspec at lines 299-303 already discloses: any other 1271 wallet on the same chain that forwards to the same owner EOA (a Safe, another deterministic smart-account product, a 4337 account, an EIP-7702 delegate) will validate the same `hash + signature`. Consumers that don't bind `verifyingContract` accept Alice's vault-A signature against sibling wallet B.

Same root cause as S-1 (no `verifyingContract` binding) but on a single chain. The natspec disclosure shifts the burden to consumers; in practice, long-tail 1271 consumers often miss `verifyingContract`.

**Proof of Concept**:
```
1. Alice's EOA owns PunkVault 0xV1 and a Safe 0xS1 on the same chain.
2. FooMarket accepts 1271 sigs and hashes {asset, price, deadline}, forgetting verifyingContract.
3. Alice signs hash H intending vault 0xV1's authorization.
4. Attacker submits (H, sig) claiming signer = 0xS1.
5. FooMarket calls 0xS1.isValidSignature(H, sig) -> forwards to Alice EOA -> Alice -> FooMarket accepts the sale against the Safe.
```

**Recommendation**:
Same as S-1. The natspec disclosure is reasonable as a stopgap but is not a substitute for binding `verifyingContract`. ERC-7739 wrapping (Option A above) automatically resolves this — every wallet's wrapper hash includes its own `address(this)`. Without that, the burden is on consumers; document it loudly.

---

## [S-3] Owner-is-contract: 1271 trust transitively delegated to owner's logic, including future upgrades and EIP-7702 delegation
**Severity**: Low
**Category**: evm-audit-signatures
**Location**: `PunkVault.isValidSignature()` PunkVault.sol:304-312 (forwarding path via `SignatureChecker.isValidSignatureNowCalldata`)
**Description**:
When `owner()` is an EOA (`code.length == 0`), `SignatureChecker` does ECDSA — clean, immutable. When `owner()` is a contract, the call becomes a staticcall to `owner().isValidSignature(hash, sig)` and the vault trusts whatever the owner returns.

Implications:
1. Upgradeable owner (Safe behind beacon, 4337 with mutable validation module, 7702 delegate): changes to the owner's 1271 logic silently change what the vault accepts.
2. EIP-7702 owner: a user might delegate-set their EOA to a smart-account program. After 7702 delegation, `owner().code.length != 0`, and validation silently switches ECDSA -> 1271 forwarding. If the 7702 program has a buggy 1271 (e.g., returns `0x1626ba7e` unconditionally), the vault becomes a wildcard signer.
3. The owner is bound for life (immutable args, no setter), so this risk is set at vault-creation time — no recovery if the owner becomes compromised or its 1271 logic deteriorates.

The natspec at lines 291-297 frames this as a feature ("the vault is a valid signer of any hash the owner has signed"), not as a security caveat.

**Proof of Concept**:
```
1. Alice's EOA is 7702-delegated to a buggy module with isValidSignature(h,sig) { return 0x1626ba7e; }.
2. Alice creates PunkVault 0xV. Because her EOA now has code, SignatureChecker takes the 1271 branch.
3. Any (hash, anything) presented to 0xV.isValidSignature returns valid.
4. Any 1271-consumer accepts arbitrary forged orders from 0xV.
```

**Recommendation**:
- Add an explicit caveat to the `isValidSignature` natspec: "Trust transitively follows the owner's 1271 logic at call time, including future upgrades and EIP-7702 delegations. Owners are bound for life; choose accordingly."
- No code change required if the "trust the owner's 1271" model is intended.

---

## [S-4] Unbounded `signature` length and ungated gas forwarding enable consumer-side grief
**Severity**: Low
**Category**: evm-audit-signatures
**Location**: `PunkVault.isValidSignature()` PunkVault.sol:304-312
**Description**:
`signature` is `bytes calldata` with no length cap, forwarded into `SignatureChecker.isValidSignatureNowCalldata`. EOA owner -> ECDSA rejects non-65-byte sigs cheaply (safe). Contract owner -> the bytes are forwarded into the staticcall via `calldatacopy` with all remaining gas (`gas()`). A malicious owner contract can:
- consume all forwarded gas (grief the *consumer* of `isValidSignature`),
- return a huge returndata blob; SignatureChecker only reads 32 bytes but the consumer still pays for returndata expansion.

This isn't a vault-side fund loss; the grief target is the 1271 consumer. Real-world consumers (Seaport, Permit2) bound gas and tolerate it. Recorded because the checklist explicitly flags gas griefing.

**Proof of Concept**:
```
1. Bob configures his vault owner = a contract whose isValidSignature(...) loops to OOG.
2. Bob sells on a 1271-consuming market that staticcalls Bob's vault with all gas.
3. The market's tx OOGs; Bob loses nothing; relayer/counterparty UX is griefed.
```

**Recommendation**:
Informational. Optional cosmetic fix: cap signature length (`if (signature.length > 4096) return 0xffffffff;`) to make grief harder. The structural fix is consumer-side gas-capped staticcalls.

---

## [S-5] No nonce, deadline, or replay window on the 1271 surface (by design)
**Severity**: Info
**Category**: evm-audit-signatures
**Location**: `PunkVault.isValidSignature()` PunkVault.sol:304-312
**Description**:
The 1271 implementation is stateless: no nonce, no deadline, no per-hash consumed mapping. Any signed hash remains forever valid as long as the underlying owner's signing logic still validates it. This is intentional — the vault is a passthrough — but the "Missing expiration / deadline" and "Nonce-less signatures infinitely replayable" checklist items merit a deliberate note: the responsibility is shifted to the consuming protocol. Seaport and Permit2 handle this. SIWE-style applications must too.

**Proof of Concept**: N/A — informational.

**Recommendation**: Document in the natspec that `isValidSignature` is stateless and that "consumed once" semantics, if needed, must be enforced by the calling protocol.

---

## [S-6] Solc 0.8.34 is current; no `abi.encodePacked` collision risk on signature path
**Severity**: Info
**Category**: evm-audit-signatures
**Location**: file-wide
**Description**:
Solc 0.8.34 is current and has no known signature-related bugs. There is no `abi.encodePacked` use anywhere in either file — the vault never builds a signed-message preimage; it consumes whatever `bytes32 hash` the caller provides. The "abi.encodePacked collision" checklist items are N/A by construction.

**Recommendation**: None.

---

## [S-7] OZ ECDSA/SignatureChecker mitigations confirmed; ecrecover-zero and `s`-malleability handled
**Severity**: Info
**Category**: evm-audit-signatures
**Location**: `@openzeppelin/contracts@5.6.1` (SignatureChecker.sol v5.6.0, ECDSA.sol v5.6.0)
**Description**:
Verified at library level:
- `tryRecover` / `tryRecoverCalldata` reject signatures with `s > secp256k1n/2` (ECDSA.sol:185-187) — malleability addressed.
- `tryRecover` returns `(address(0), RecoverError.InvalidSignature, …)` if `ecrecover` returns zero (ECDSA.sol:190-193). `SignatureChecker.isValidSignatureNowCalldata` then checks `err == NoError && recovered == signer` (SignatureChecker.sol:51), so an `address(0)` recovery can never match a non-zero signer.
- Only 65-byte signatures recover (line 89); everything else returns `InvalidSignatureLength`.
- The clone immutable-args `owner()` reader has a `NotClone` guard (PunkVault.sol:67), and the factory's `ensureVault` rejects `user == address(0)` (line 36). Structurally impossible for a vault to exist whose `owner()` returns `address(0)`. The "ecrecover returns 0 matching unset signer" attack is doubly defended (library check + structural guarantee).

**Recommendation**: Pin OZ to `5.6.1` (already done). On future OZ bumps, run fuzzing against malleability/empty-sig crafts.

---

## [S-8] Permissionless vault deployment does not affect signature security
**Severity**: Info
**Category**: evm-audit-signatures (touch-point)
**Location**: `PunkVaultFactory.ensureVault` PunkVaultFactory.sol:35-38
**Description**:
Anyone can call `ensureVault(user)` and deploy Alice's vault. Signature-relevant only inasmuch as: an attacker pre-deploying Alice's vault deploys a vault genuinely owned by Alice (immutable args encode `user`), so this grants the attacker no signing power. `ensureVault(user)` has no `operators` parameter (only `ensureMyVault` does, and it uses `msg.sender`), so a griefer cannot seed an attacker-controlled operator either.

**Recommendation**: None — design intent.

---

## Checklist completion table

| # | Checklist item | Status | Finding |
|---|----------------|--------|---------|
| 1 | Missing chain ID in signature | Vulnerable | S-1 |
| 2 | Missing `address(this)` / `verifyingContract` | Vulnerable | S-1, S-2 |
| 3 | Missing `msg.sender` binding | N/A | 1271 is `view`; no `msg.sender` semantics |
| 4 | Nonce-less signatures infinitely replayable | Info / by design | S-5 |
| 5 | Stale nonce check (reentrancy) | N/A | no nonces |
| 6 | ecrecover returns address(0) | Mitigated | S-7 |
| 7 | Signature malleability (low-half `s`) | Mitigated | S-7 |
| 8 | Encoding scheme mismatch | N/A | no preimage construction |
| 9 | `abi.encodePacked` dynamic collision | N/A | not used |
| 10 | `DOMAIN_SEPARATOR` cached at deployment | N/A | no domain separator (root of S-1) |
| 11 | Struct hash must include all fields | N/A | no struct hashing |
| 12 | EIP-712 salt for cross-protocol replay | N/A | no EIP-712 |
| 13 | Permit (2612) front-running | N/A | no permit consumption |
| 14 | DAI non-standard permit | N/A | no permit consumption |
| 15 | Not all ERC20s support permit | N/A | no permit consumption |
| 16 | Trusted forwarder ERC-2771 | N/A | no meta-tx |
| 17 | Gas griefing on relayed transactions | Info | S-4 |
| 18 | `isValidSignature` called on non-contract | N/A (vault perspective) | vault is the 1271 contract |
| 19 | `isValidSignature` upgradeable to accept anything | Latent | S-3 (transitive via owner) |
| 20 | Signature malleability with raw ecrecover | Mitigated | S-7 |
| 21 | Recovered address of zero | Mitigated | S-7 |
| 22 | Signature used by wrong person | Vulnerable depending on consumer | S-1, S-2 |
| 23 | Missing expiration / deadline | Info / by design | S-5 |
| 24 | Cross-chain signature replay | Vulnerable | S-1 |
| 25 | DOMAIN_SEPARATOR cached in constructor breaks on fork | N/A | no domain separator |
| 26 | `abi.encodePacked` collision (dup) | N/A | |
| 27 | Missing nonce / KYC replay | Info / by design | S-5 |
| 28 | Cross-chain replay — UserOp chain_id | Vulnerable | S-1 |
| 29 | Missing parameter in signature -> drainage | N/A | vault doesn't consume signed parameters |
| 30 | No expiration grants lifetime license | Info / by design | S-5 |
| 31 | Unchecked ecrecover address(0) (dup) | Mitigated | S-7 |
| 32 | Signature malleability dual [v,r,s] (dup) | Mitigated | S-7 |

---

## Summary

The vault's signature surface is intentionally minimal — a raw passthrough — and that intent is the source of every real issue. OZ ECDSA/SignatureChecker are current and correctly mitigate the low-level pitfalls (S-7). The clone architecture rules out `owner() == address(0)` entirely.

Substantive risk concentrates in **S-1 (cross-chain replay via deterministic vault address + no `chainId` binding, High)** and **S-2 (sibling-wallet replay, Medium)**. The natspec at PunkVault.sol:299-303 discloses S-2 but not S-1, even though S-1 is the strictly larger surface — every L2 the factory lands on at the same address becomes a replay target. Disclosure is reasonable as partial mitigation for sophisticated consumers (Seaport/Permit2 are safe) but inadequate for the long tail.

Recommended fix: adopt ERC-7739 nested-typed-data wrapping (OZ ships `draft-ERC7739` in v5.6.1, already in the dependency tree). It preserves Seaport/Permit2 compatibility while binding the vault's own `verifyingContract` and `chainId`, resolving S-1 and S-2 simultaneously.

**S-3** (transitive owner-1271 / 7702 trust) is Low — deliberate but framed as a feature rather than a caveat in the natspec. **S-4** (gas grief) and **S-5** (statelessness) are informational. **S-6–S-8** confirm other checklist items are handled or N/A.
