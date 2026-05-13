# Assembly & Low-Level Constructs Audit — PunkVault / PunkVaultFactory

**Date**: 2026-05-13
**Auditor**: Opus 4.7
**Scope**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`

**Checklist**: `evm-audit-assembly` — https://raw.githubusercontent.com/austintgriffith/evm-audit-skills/main/evm-audit-assembly/references/checklist.md
**Compiler**: Solidity `0.8.34`
**OpenZeppelin Contracts**: `^5.6.1` in `package.json`; installed `proxy/Clones.sol` is marked "last updated v5.5.0". Offset constants verified against the installed copy.

## Preamble

This review focuses exclusively on assembly / low-level surfaces in the two contracts:

1. `PunkVault.owner()` inline assembly (`extcodecopy` + `shr`) to read the immutable owner argument appended after the ERC-1167 proxy runtime by `Clones.cloneDeterministicWithImmutableArgs`.
2. `PunkVaultFactory` CREATE2 deterministic deployment via `Clones.cloneDeterministicWithImmutableArgs` with `salt = bytes32(uint256(uint160(user)))` and `args = abi.encodePacked(user)`.
3. Low-level `call` in `PunkVault.execute`, `PunkVault.executeBatch`, `PunkVault.withdrawFromMarketTo`, with return data bubbled through `ExecutionFailed(bytes returnData)`.

Headline: the assembly is correct, the `memory-safe` annotation is valid, the `0x2d` offset matches OZ's own `_cloneCodeWithImmutableArgs` / `fetchCloneArgs`, and the CREATE2 surface has no salt-collision / metamorphic exposure because the salt and immutable args are both 1:1 with the user, and no `selfdestruct` exists anywhere in the deployed bytecode. The only mitigation worth implementing is bounding the returndata captured into the `ExecutionFailed` custom error.

---

## [A-1] Return-bomb via `ExecutionFailed(bytes returnData)`
**Severity**: Low
**Category**: evm-audit-assembly (Low-Level Calls / Return bomb)
**Location**: `PunkVault.execute` (PunkVault.sol:215-216), `PunkVault.executeBatch` (:232-233), `PunkVault.withdrawFromMarketTo` (:201-202)

**Description**:
Each of these call sites does `(bool ok, bytes memory ret) = target.call{value: ...}(data);` and on failure executes `revert ExecutionFailed(ret);`. Solidity's `target.call(...)` returning `(bool, bytes memory)` performs an unbounded `returndatacopy(0, 0, returndatasize())` into memory, then ABI-encodes `ret` into the custom error. A malicious `target` can return an enormous payload and force quadratic memory-expansion gas on the caller (the vault). All three entrypoints are owner-or-operator gated, so the impact is bounded to actors the owner has already trusted with the vault's ETH, which is why this is Low not Medium. The mitigation is cheap and standard.

**Proof of Concept**:
```solidity
contract Bomb {
    fallback() external payable {
        assembly { revert(0, 0x100000) } // 1 MB revert data
    }
}
```
`vault.execute(address(bomb), 0, "")` from a privileged caller forces the EVM to copy 1 MB of returndata into memory (memory cost is quadratic: ~2.2M gas at 1 MB) and re-encode it inside `ExecutionFailed(ret)`. A larger payload pushes the cost higher.

**Recommendation**:
Either (a) accept the trust model and document that owners must not point `execute` at adversarial contracts, or (b) cap the captured returndata via a small helper:
```solidity
function _callAndRevert(address t, uint256 v, bytes memory d) private returns (bytes memory ret) {
    bool ok;
    assembly ("memory-safe") {
        ok := call(gas(), t, v, add(d, 0x20), mload(d), 0, 0)
        let sz := returndatasize()
        if gt(sz, 0x1000) { sz := 0x1000 }   // cap at 4 KB on failure
        ret := mload(0x40)
        mstore(ret, sz)
        returndatacopy(add(ret, 0x20), 0, sz)
        mstore(0x40, add(add(ret, 0x20), sz))
    }
    if (!ok) revert ExecutionFailed(ret);
}
```

---

## [A-2] Impl-level `_initialized = true` seal is defensive-but-inert
**Severity**: Info
**Category**: evm-audit-assembly (CREATE pattern hygiene)
**Location**: `PunkVault.constructor` (PunkVault.sol:53-57)

**Description**:
`_initialized = true` on the implementation prevents `factoryInitialize` on the bare impl. `factoryInitialize` is already gated by `msg.sender == FACTORY` where `FACTORY` is set in the impl's constructor to the factory address; the factory never calls `factoryInitialize` on the impl itself. The seal is harmless belt-and-braces — consistent with OZ guidance for upgradeable-style implementations.

**Recommendation**: Keep as-is.

---

## [A-3] `extcodecopy` on a non-clone returns zeros — guarded by `_SELF` check
**Severity**: Info
**Category**: evm-audit-assembly (extcodecopy / extcodesize edge cases)
**Location**: `PunkVault.owner()` (PunkVault.sol:62-76)

**Description**:
The `if (address(this) == _SELF) revert NotClone();` guard rejects direct calls on the bare implementation. Other "all zeros" risks: (a) calling `owner()` during the clone's constructor — clones produced by ERC-1167 have no constructor, so `owner()` is never callable during construction; (b) `selfdestruct` — neither `PunkVault` nor the 1167 stub contains `SELFDESTRUCT`, so post-Dencun (EIP-6780) the code cannot be purged. The clone runtime length is exactly `0x2d + 0x14 = 0x41` bytes (65), and `extcodecopy` reads the trailing 20 bytes correctly.

**Recommendation**: Optional one-line invariant comment: `// clone runtime is exactly 0x2d (proxy) + 0x14 (owner) = 0x41 bytes`.

---

## [A-4] `0x2d` magic number is pinned to OZ's current ERC-1167 layout
**Severity**: Info
**Category**: evm-audit-assembly (memory offset constants)
**Location**: `PunkVault.owner()` (PunkVault.sol:73)

**Description**:
Verified by direct inspection of installed `node_modules/@openzeppelin/contracts/proxy/Clones.sol`:
- `_cloneCodeWithImmutableArgs(...)` builds `<initcode-prefix(10)> <1167-runtime(45)> <args>`, so the deployed runtime is 45-byte ERC-1167 + args.
- `fetchCloneArgs(...)` uses the same `0x2d` offset.

ERC-1167 is a fixed standard (45-byte runtime), so the constant is safe. No defensive layer exists if OZ ever changed it.

**Recommendation**: Optional — call `Clones.fetchCloneArgs(address(this))` to delegate the offset to OZ, or define `uint256 constant CLONE_RUNTIME_LEN = 0x2d;` for readability. Functionally fine as-is.

---

## [A-5] `memory-safe` annotation is correct
**Severity**: Info
**Category**: evm-audit-assembly (memory-safe correctness)
**Location**: `PunkVault.owner()` (PunkVault.sol:72-75)

**Description**:
The block writes 20 bytes at offset `0x00` (Solidity scratch space, `0x00–0x3f`, explicitly permitted by the memory-safe contract), does not touch the free memory pointer at `0x40`, does not perform any external call (no `returndatacopy` clobber), and does not write past scratch. The `shr(96, mload(0x00))` produces a clean 160-bit value; assigning it to an `address`-typed Yul return variable is well-defined.

**Recommendation**: No change.

---

## [A-6] CREATE2 surface is clean — no salt-collision, metamorphic, or front-running exposure
**Severity**: Info
**Category**: evm-audit-assembly (CREATE2 deep dive)
**Location**: `PunkVaultFactory._deployIfMissing`, `_salt` (PunkVaultFactory.sol:55-71)

**Walk-through**:
- **selfdestruct + redeploy**: No `SELFDESTRUCT` opcode in `PunkVault`, the ERC-1167 stub, or the factory. Metamorphic redeploy is impossible.
- **Birthday collision (~2^80)**: Per-vault, per-user value at risk; not a global pool. Standard caveat, not specific to this code.
- **Salt = `bytes32(uint256(uint160(user)))`, args = `abi.encodePacked(user)`**: Both the CREATE2 salt and the initcode hash are 1:1 with `user`. Two distinct users cannot collide. The initcode includes the immutable args, so changing `user` changes both `salt` and `keccak256(initcode)` — front-running by a third party producing the same address with a different owner is impossible.
- **`ensureVault(user)` permissionless**: By design — third parties may pre-deploy. The owner encoded in the immutable args remains `user`; the deployer gains nothing.
- **`ensureMyVault(operators)`**: Deploys for `msg.sender` and seeds operators for `msg.sender`'s vault only. A third party cannot seed someone else's vault with operators via this path.
- **Factory itself not CREATE2-deployed in this code**: No "CREATE inside CREATE2" metamorphic chain. Even if the factory were CREATE2-deployed and rebuilt, its single CREATE-deployed child (the impl, nonce 0) would have identical bytecode, so no functional change.
- **`extcodehash` registration**: No stored hashes used for trust; no stale-hash vector.
- **Reorg**: CREATE2 is nonce-independent — addresses are reorg-stable.

**Recommendation**: No change.

---

## [A-7] Front-running `ensureVault` is harmless
**Severity**: Info
**Category**: evm-audit-assembly (CREATE2 front-running)
**Location**: `PunkVaultFactory.ensureVault` (PunkVaultFactory.sol:35-38)

**Description**:
Anyone can deploy any user's vault. Because owner is encoded in immutable args (= `user`), no privilege escalation. Optional: `emit VaultDeployed(user, vault, msg.sender)` for observability; not security-relevant.

---

## [A-8] `stash()` uses `code.length` — standard pattern, post-EIP-6780 safe
**Severity**: Info
**Category**: evm-audit-assembly (extcodesize post-selfdestruct)
**Location**: `PunkVault.stash` (PunkVault.sol:179-181)

**Description**:
`stashAddr.code.length == 0` is the canonical "does this contract exist yet?" check. The Stash factory at `0x000000000000A6fA31F5fC51c1640aAc76866750` is out of scope. Post-EIP-6780 `selfdestruct` doesn't purge code unless the contract was created in the same tx, so the check is robust.

**Recommendation**: No change.

---

## [A-9] PUSH0 / EVM target — multi-chain caveat
**Severity**: Info
**Category**: evm-audit-assembly (compiler quirks)
**Location**: project-wide

**Description**:
Solidity 0.8.34 default `evmVersion` is `cancun` (uses `PUSH0`, `MCOPY`, `TLOAD/TSTORE`). The factory's natspec emphasises "stable across networks", so multi-chain deployment is intended. If any target chain lacks Cancun, pin `evmVersion` in hardhat config (`shanghai` or `paris`) to avoid silent deployment failure. As of 2026-05 every major L1/L2 supports PUSH0, but niche sidechains and some testnets may not yet support Cancun.

**Recommendation**: Pin `evmVersion` explicitly if any target chain pre-dates the assumed hardfork.

---

## Checklist completion table

Legend: ok = walked, no issue; info = informational/best-practice; finding = real finding; N/A = not applicable.

| # | Item | Status | Ref |
|---|---|---|---|
| **CREATE / CREATE2** | | | |
| 1 | CREATE2 + selfdestruct = arbitrary code replacement | ok | A-6 |
| 2 | Four states of a CREATE2 address | ok | counterfactual deposits documented |
| 3 | CREATE2 address collision attack (birthday) | ok | A-6 |
| 4 | Factory deploying via CREATE inside CREATE2 | ok | A-6 |
| 5 | Bytecode verification not sufficient | ok | no stored hashes |
| 6 | extcodesize == 0 during constructor (isContract bypass) | N/A | no isContract gate |
| 7 | Pre-deployed CREATE2 address has no code | ok | A-6 / A-8 |
| 8 | extcodecopy from self-destructed contract returns empty | info | A-3 |
| **Inline Assembly Math** | | | |
| 9 | div(x, 0) returns 0 | N/A | no div in assembly |
| 10 | No overflow/underflow in assembly | N/A | no arithmetic in assembly |
| 11 | shr/shl with shift ≥ 256 returns 0 | ok | constant shift = 96 |
| 12 | signextend misunderstanding | N/A | not used |
| **Memory & Calldata in Assembly** | | | |
| 13 | Quadratic memory expansion | ok | fixed offsets only |
| 14 | Free memory pointer corruption | ok | A-5 |
| 15 | Returndata buffer reuse | info | A-1 |
| 16 | calldataload beyond calldatasize | N/A | not used |
| **Low-Level Calls** | | | |
| 17 | call() to non-existent contract returns success | info | owner/operator-gated; see A-1 |
| 18 | delegatecall preserves msg.sender / msg.value | N/A | no delegatecall in app code |
| 19 | Return bomb attack | finding | A-1 |
| 20 | Gas forwarding 63/64 rule | ok | forwards all gas; no nested critical budget |
| **Compiler & EVM Version** | | | |
| 21 | PUSH0 not supported pre-Shanghai | info | A-9 |
| 22 | address(this).code.length in constructor | N/A | not used |
| 23 | type(uint8).max off-by-one | N/A | not used |
| 24 | Dirty upper bits in assembly | ok | `shr(96, ...)` cleans upper bits |
| **Precompiles** | | | |
| 25 | ecrecover gas cost | N/A | bounded by single 1271 call |
| 26 | modexp gas cost | N/A | not used |
| 27 | Precompile address range varies by chain | N/A | none hardcoded |
| **CREATE/CREATE2 Deep Dive** | | | |
| 28 | CREATE2 + selfdestruct metamorphic | ok | no selfdestruct |
| 29 | EXTCODESIZE 0 during construction | N/A | not used |
| 30 | CREATE2 prediction with different bytecode | ok | initcode fully determined by `user` |
| 31 | CREATE nonce / reorg | ok | CREATE2 only; salt-based |
| **Inline Assembly Pitfalls (Expanded)** | | | |
| 32 | div(x,0) silently returns 0 | N/A | |
| 33 | Assembly arithmetic silently overflows | N/A | |
| 34 | Memory ops corrupting FMPA | ok | A-5 |
| 35 | chainid/extcodesize available natively | ok | `extcodecopy` has no Solidity equivalent for slice; justified |
| **Dacian Phase 3** | | | |
| 36 | External call overwriting assembly-stored vars | ok | single block, no external call between mstore & mload |
| 37 | Stale FMPA across assembly blocks | N/A | single block |
| 38 | Insufficient allocation off-by-32 | N/A | no dynamic buffer in assembly |
| 39 | Call to non-existent contract success in assembly | info | same surface as #17 |
| 40 | Overflow/underflow in assembly | N/A | |
| 41 | uint128 overflow evades 256-bit check | N/A | |

---

## Summary

- **Critical / High / Medium**: 0
- **Low**: 1 — A-1 (return-bomb on revert path)
- **Info**: 8 — A-2 .. A-9

The assembly is small, surgical, correctly `memory-safe`-annotated, and pinned to OZ's documented ERC-1167 + immutable-args layout. The CREATE2 surface is clean because the salt and immutable args are both 1:1 with the user, and no `SELFDESTRUCT` exists in the deployed bytecode. The single recommended mitigation is capping the returndata captured into `ExecutionFailed`.
