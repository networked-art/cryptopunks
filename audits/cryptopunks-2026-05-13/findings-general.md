# PunkVault & PunkVaultFactory — General EVM Audit

**Scope**: `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`, `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`
**Date**: 2026-05-13
**Checklist**: evm-audit-general/checklist.md
**Solidity**: `0.8.34` (fixed) — OpenZeppelin Contracts `5.6.1`

## Context

`PunkVault` is a per-user, ERC-1167 clone-with-immutable-args smart account custodying CryptoPunks across any CryptoPunks-style market. Each user gets exactly one deterministic vault, deployed by `PunkVaultFactory` at a CREATE2 salt derived from their own address. The clone's runtime carries the owner address as appended immutable args; the implementation reads it via `extcodecopy` (offset `0x2d`, length `0x14`) and rejects calls on the bare implementation. Owner-or-operator may call the punks surface (transfer / list / buy / bid / proceeds / stash); owner-only may call `execute` / `executeBatch` (raw `CALL`, never `DELEGATECALL`); `factoryInitialize` is a one-shot operator-preapproval gated on `FACTORY`. The implementation is sealed in its own constructor (`_initialized = true`). ERC-1271 forwards to the owner via OZ `SignatureChecker`. The vault deliberately holds an ETH balance to fund market spends; counterfactual deposits to `predictVault` are an advertised feature. No pause mechanism, no upgrade path, no rebasing/4626 logic, no merkle trees, no time/block-number assumptions, no internal token accounting.

Walking the general checklist, the only material findings are around (a) low-level call returndata bombing in the proceeds path, (b) cross-chain address parity of the implementation, (c) information disclosed by `isOperator`, and (d) `executeBatch` `msg.value` aliasing (informational — owner-only and by design). The vault is small and focused; its architecture eliminates most checklist failure modes by construction.

---

## [G-1] `withdrawFromMarketTo` low-level call exposes caller to returndata-bombing grief by `recipient`

**Severity**: Low
**Category**: evm-audit-general
**Location**: `PunkVault.withdrawFromMarketTo()` — `contracts/contracts/PunkVault.sol:194-204`
**Description**: The forwarding call captures full returndata into Solidity-allocated memory:

```solidity
(bool ok, bytes memory ret) = recipient.call{value: withdrawn}("");
if (!ok) revert ExecutionFailed(ret);
```

When `ok == true`, `ret` is still allocated — Solidity performs `returndatacopy` into a fresh memory region regardless of how the result is used. A malicious `recipient` (or an EOA whose code is replaced via EIP-7702) can return megabytes of `bytes` from `receive`/`fallback`, forcing quadratic memory-expansion costs on the vault caller. This is the classic returndata-bomb (`beirao E-04`, RareSkills "returning large memory arrays for gas griefing").

Blast radius is limited: `recipient` is supplied by owner/operator, so the griefer is already authorised — they can only burn the caller's own gas. But because operators have unbounded ETH-spend authority on this vault, an operator-controlled `recipient` *is* a realistic profile, and the failure mode silently inflates a routine proceeds-withdrawal into a near-OOG transaction.

**Proof of Concept**:
1. Owner approves contract `X` (attacker-controlled) as operator.
2. Operator `X` calls `withdrawFromMarketTo(market, X)`.
3. `X`'s `receive()` returns 200 KB of `bytes`.
4. Solidity's `RETURNDATACOPY` into `ret` forces `~6,250` words of memory expansion; cost climbs into the millions of gas. Same shape applies to `execute` / `executeBatch` but those are owner-only and the owner controls the target.

**Recommendation**: Either discard returndata on success, or cap it. Cheapest fix — use inline assembly to ignore returndata when the call succeeds:

```solidity
bool ok;
assembly ("memory-safe") {
    ok := call(gas(), recipient, withdrawn, 0, 0, 0, 0)
}
if (!ok) {
    assembly ("memory-safe") {
        let size := returndatasize()
        if gt(size, 256) { size := 256 }
        let ptr := mload(0x40)
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
    }
}
```

Or accept the gas-grief as part of the operator trust model and leave it.

---

## [G-2] `executeBatch` re-uses `msg.value` across iterations (owner-only — informational)

**Severity**: Info
**Category**: evm-audit-general
**Location**: `PunkVault.executeBatch()` — `contracts/contracts/PunkVault.sol:222-238`
**Description**: Each iteration forwards `c.value` independently:

```solidity
(bool ok, bytes memory ret) = c.target.call{value: c.value}(c.data);
```

There is no check that `sum(c.value) <= msg.value`. The `msg.value`-in-loop pattern (`beirao E-17`, RareSkills "msg.value reused in loops", Opyn-hack class) applies on the surface — but the vault is *deliberately* designed to fund spends from its own ETH balance alongside attached `msg.value`, and `executeBatch` is owner-only. The owner is the sole caller, the owner owns the balance, and the function is documented as the smart-account general-execution path.

**Proof of Concept**: N/A — exploiting it would require the attacker to *be* the owner, who already has unbounded authority over the vault.

**Recommendation**: No change. Optional: add an inline comment at the loop pointing the next auditor at the design intent (mirrors the comment in `IPunkVault.sol:99-104` covering `buyPunk`/`enterBidForPunk`).

---

## [G-3] Cross-chain vault-address parity depends on factory's deploy-time nonce

**Severity**: Low
**Category**: evm-audit-general
**Location**: `PunkVaultFactory` constructor + `_deployIfMissing` — `contracts/contracts/PunkVaultFactory.sol:20-22, 55-64`
**Description**: The factory constructor deploys the implementation via plain `CREATE`:

```solidity
constructor() {
    IMPLEMENTATION = address(new PunkVault(address(this)));
}
```

`IMPLEMENTATION` is therefore `keccak256(rlp(factoryAddr, factoryNonce=1))[12:]`. The clone address per user is `Create2(factoryAddr, salt, keccak256(cloneCode(IMPLEMENTATION, user)))`, which embeds `IMPLEMENTATION` in the init-code hash. So *cross-chain* parity of vault addresses requires **both** (1) `PunkVaultFactory` is deployed at the same address on each chain *and* (2) the factory's first internal `CREATE` lands at the same nonce — which in practice means the factory must be deployed by an EOA/CREATE2-deployer that does nothing else between the deploy step and the constructor's inner `new PunkVault`.

The doc says "the vault address is stable across networks" — true *per chain* once the factory is deployed, but cross-chain it's only as strong as the deployment script. A reorg of the factory deployment, or deployment via a contract that does other CREATEs first, breaks parity (`beirao G-19`).

**Proof of Concept**:
1. Deploy `PunkVaultFactory` on Mainnet via EOA at nonce N. Implementation lands at `KECCAK(rlp(factory, 1))[12:] = 0xAAA...`.
2. Deploy `PunkVaultFactory` on Base via the same factory address (via CreateX/CREATE2), but the deployer is a contract that bumps its own nonce between the deploy step and the factory constructor's `new PunkVault(...)` — implementation lands at a different address.
3. `predictVault(user)` returns different addresses on the two chains. Funds sent to mainnet's `predictVault(user)` cannot be recovered on Base via the same address.

In practice, a vanilla CREATE2 deploy through a deterministic-deployer contract makes `new PunkVault(this)` the factory's first CREATE (nonce 1) on every chain, and parity holds — the risk is purely deployment-script discipline.

**Recommendation**: Either (1) deploy the implementation separately via CREATE2 from the same deterministic deployer and pass its address into the factory's constructor — removes the nonce dependency entirely, or (2) document loudly in the deployment script that the factory must be deployed such that the inner `new PunkVault` lands at nonce 1, and add a deploy-time test that asserts the cross-chain `IMPLEMENTATION` match.

---

## [G-4] `isOperator(owner())` returns `false` even though the owner has strictly more authority

**Severity**: Low
**Category**: evm-audit-general
**Location**: `PunkVault.isOperator()` — `contracts/contracts/PunkVault.sol:96-98`
**Description**: `isOperator` reads only the explicit allow-mapping:

```solidity
function isOperator(address operator) external view returns (bool) {
    return _operatorApproved[operator];
}
```

The internal auth helper `_isOwnerOrOperator` correctly OR's owner-ness with the mapping (lines 329-331), but external callers using `isOperator` to determine "can this address move my Punk / spend my ETH on this vault?" get a misleading negative for the owner. This is the `beirao G-11` semantic-overloading pitfall: `false` here ambiguously means "not approved" *or* "approved as something higher than approval" (the owner). Indexers, dashboards, and integrating wallets that gate UI on `isOperator(addr)` will under-display the owner's authority. Seaport-class integrators that pre-check "is this caller an operator on the seller's vault?" will refuse the owner's own listings.

**Proof of Concept**:
1. Owner = `0xAlice`. `_operatorApproved[0xAlice] == false`.
2. `vault.isOperator(0xAlice)` returns `false`.
3. An off-chain UI shows "Alice has no rights on her own vault" while `transferPunk` from Alice succeeds onchain.

**Recommendation**: Either rename to make scope explicit (`isApprovedOperator`), or fold the owner into the answer:

```solidity
function isOperator(address operator) external view returns (bool) {
    return operator == owner() || _operatorApproved[operator];
}
```

The latter matches `_isOwnerOrOperator`'s semantics and is the least surprising.

---

## [G-5] `factoryInitialize` accepts unbounded `operators[]` — self-DoS only

**Severity**: Info
**Category**: evm-audit-general
**Location**: `PunkVault.factoryInitialize()` — `contracts/contracts/PunkVault.sol:243-255`
**Description**: The pre-approval loop runs over a user-controlled array (`PunkVaultFactory.ensureMyVault` → `IPunkVault.factoryInitialize`) with no length cap. A user passing an oversized `operators` array forces their own deployment into OOG. The path is `msg.sender`-gated, so this is strictly self-DoS: the user pays gas to brick their own initial-init transaction. The vault remains uninitialised and can still be deployed via `ensureMyVault([])` or `ensureVault(user)`, with operators added later via `setOperator`. No escalation, no other-user impact.

**Proof of Concept**: User calls `ensureMyVault([... 50,000 addresses ...])` — tx OOGs. User retries with a smaller or empty array. No funds lost.

**Recommendation**: No required change. Optionally add a soft cap (e.g. `require(operators.length <= 32)`) to give a clean revert reason instead of OOG.

---

## [G-6] `Executed` event emits full `data` calldata — owner-only log-bomb (informational)

**Severity**: Info
**Category**: evm-audit-general
**Location**: `PunkVault.execute()` line 217, `executeBatch()` line 235
**Description**: `emit Executed(target, value, data)` includes the entire calldata `data` as a non-indexed event arg. LOG data costs 8 gas/byte; with calldata bounded only by the block gas limit, the owner can craft an `execute(target, 0, hugeData)` call that consumes most of a block on the log alone. Since the owner is the only authorised caller and pays the gas, this is informational — but if a downstream indexer rejects logs above a size threshold, the shape is worth noting.

**Proof of Concept**: N/A — owner pays.

**Recommendation**: No change required. Optionally hash `data` into the log:

```solidity
event Executed(address indexed target, uint256 value, bytes32 dataHash);
emit Executed(target, value, keccak256(data));
```

Behavioural break for any consumer reading raw `data` out of the event, so only worth it if such a consumer exists.

---

## [G-7] Constructor-time `_initialized = true` on implementation — pattern verified

**Severity**: Info
**Category**: evm-audit-general
**Location**: `PunkVault` constructor and `factoryInitialize` — `contracts/contracts/PunkVault.sol:53-57, 243-255`
**Description**: The constructor sets `_initialized = true` so direct calls to the bare implementation are sealed. ERC-1167 clones delegatecall into the implementation but have fresh storage, so `_initialized` reads as `false` from a clone. The constructor only writes to the implementation's storage. Additionally, `factoryInitialize` requires `msg.sender == FACTORY` — the implementation's `FACTORY` is the deploying factory's address, so even if a third party called `factoryInitialize` on the bare implementation they'd fail the auth check before reaching the init bit. Direct call to impl is safe (sealed). Clones start uninitialised, get init'd on first `factoryInitialize`, and re-init reverts. Pattern is consistent.

**Proof of Concept**: N/A.

**Recommendation**: No change.

---

## [G-8] PUSH0 opcode emitted by Solidity 0.8.34 — multichain caveat

**Severity**: Info
**Category**: evm-audit-general
**Location**: `pragma solidity 0.8.34` — both contracts
**Description**: Solidity ≥ 0.8.20 emits `PUSH0` by default (Shanghai EVM). Several alt-EVM chains historically lagged Shanghai; deploying PUSH0-compiled contracts to a pre-Shanghai chain hits `InvalidOpcode` at runtime (`multichain-auditor`, `beirao MC-03`). All major L2s now accept PUSH0, but if the project ever targets an alt-EVM appchain, set `evmVersion: "paris"` in the compiler config or verify Shanghai support first.

**Proof of Concept**: Compile and deploy to a chain stuck pre-Shanghai. Deployment succeeds; every transaction reverts at the first PUSH0 with `InvalidOpcode`.

**Recommendation**: Document the supported chain list; downgrade `evmVersion` to `paris` if a non-Shanghai chain is on the roadmap.

---

## Checklist completion

| Checklist item | Status | Note |
|---|---|---|
| Call to non-existent address returns true | ok | `stash` checks `stashAddr.code.length` before transfer; other `.call` targets either accept ETH (no-op success acceptable) or are user-supplied — user owns the failure |
| Returndata bombing | finding | G-1 — `withdrawFromMarketTo` |
| Fixed gas in `.call{gas:X}` | ok | No hardcoded gas |
| `msg.value` persistence in multicall/batch | finding | G-2 — `executeBatch` aliases by design, owner-only |
| `msg.value` in multi-call via delegatecall | ok | No `delegatecall` anywhere |
| try/catch always fails with insufficient gas | ok | No `try/catch` |
| `abi.encodePacked` with 2+ dynamic types | ok | Only single-arg `abi.encodePacked(user)` in factory |
| Delegate calls to non-library contracts | ok | No `delegatecall`; `execute` is documented as CALL-only |
| ETH transfer via `transfer`/`send` | ok | Uses `.call{value:}` everywhere |
| Unchecked return of low-level `.call()` | ok | All `.call` returns are checked |
| Force-feed via `selfdestruct` | ok | `address(this).balance` only used as a diff in `withdrawFromMarketTo:197-199`; no invariant ties value to balance |
| Force-feed via pre-CREATE2 address | ok | Counterfactual deposits are an advertised feature; no balance-zero invariant in constructor/init |
| Coinbase force-feeding | ok | No balance-based invariants |
| Direct token transfers bypass accounting | ok | No internal token accounting — vault is non-tracking |
| Pause: liquidations / front-running / missing / brick | N/A | No pause mechanism |
| Read-only reentrancy | ok | Receive hooks return constant selectors; `owner()` reads bytecode; no protocol-readable state changes on callbacks |
| Cross-contract reentrancy | ok | Each clone has independent storage; no shared mutable state across vaults |
| ERC721/ERC1155 safeTransfer callbacks | ok | Hooks accept and modify nothing — no internal state to corrupt |
| ERC777 hooks | ok | No vault path performs ERC20 accounting; `execute` is owner-only |
| nonReentrant must be first | N/A | No reentrancy guards used |
| Merkle proofs / zero hash / dup leaves | N/A | No merkle trees |
| Withdraw should undo deposit state | N/A | No deposit/withdraw accounting (non-tracking custody) |
| Semantic overloading | finding | G-4 — `isOperator` returns `false` for owner |
| Inconsistent duplicated implementations | ok | Auth funnels through `_isOwnerOrOperator`; no duplicated logic |
| Documentation-code mismatch | ok | Code and NatSpec align (verified: `STASH_FACTORY`, `FACTORY`, `_initialized` sealing, `owner()` immutable-args slot, ERC-1271 forwarding) |
| Deployment scripts not checked | finding | G-3 — cross-chain implementation-nonce parity is a deploy-script invariant |
| Unbounded loops with external calls = DoS | finding | G-5 — `factoryInitialize` (self-DoS only) |
| Duplicate addresses in calldata arrays | ok | `factoryInitialize` setting the same operator twice is idempotent; `executeBatch` is owner-only |
| First iteration edge case | ok | Loop bodies are independent per iteration |
| `block.timestamp` short intervals | N/A | No timestamp use |
| Block time / production varies across chains | N/A | No `block.number` use |
| Off-by-one in comparisons | ok | Only `if (withdrawn != 0)` and `i < len` — no boundary math |
| Incorrect logical operators | ok | Simple patterns inspected — correct |
| All agents could be the same person | ok | Owner may also be an operator; `withdrawFromMarketTo(market, owner)` is the canonical path. No Sybil-sensitive role separation |
| Receiver = system contract | ok | `withdrawFromMarketTo(market, address(vault))` just re-deposits the proceeds; `transferPunk(market, idx, vault)` is a no-op-ish but harmless |
| Solidity version-specific bugs | ok | 0.8.34 — no known bugs affecting code shape used |
| PUSH0 opcode | finding | G-8 — multichain caveat (informational) |
| Unchecked blocks need validation | ok | Only `unchecked { ++i; }` in bounded loops |
| Negative-to-uint conversions | N/A | No signed integers |
| Time literals truncation | N/A | No time literals |
| Solidity doesn't upcast to final uint size | ok | No small-uint arithmetic |
| Ternary returns uint8 | ok | Only ternary is `? selector : bytes4(0xffffffff)` — already `bytes4` typed |
| Downcasting doesn't revert on overflow | ok | No narrowing casts |
| Storage-pointer reassignment | ok | No storage-pointer reassignments |
| Delete struct with nested mapping | ok | No `delete` of structs containing mappings |
| Mixed balance accounting | ok | Single source of truth: `address(this).balance`; no shadow variable |
| Merkle proof as password | N/A | No merkle |
| msg.value reused in loops | finding | G-2 (informational, owner-only) |
| Large-memory returns for gas grief | finding | G-1, G-6 |
| ERC20 fee-on-transfer / rebasing | N/A | No ERC20 deposit/accounting |
| ERC4626 inflation attack | N/A | Not ERC4626 |
| Auction off-by-one / refinance cancel / dust loans / double-debt | N/A | No auction or lending logic in these two contracts |
| Memory struct update doesn't persist | ok | `Call calldata c = calls[i]` uses calldata pointer; no memory-copy mutation |
| State variable shadowing | ok | `PunkVault` inherits only interfaces; no parent state to shadow |
| Specific ETH balance assumption | ok | `address(this).balance` only read as a diff or as a payable funding source — no equality checks |

---

## Verdict

No High or Critical findings. The architecture eliminates whole checklist categories by being a small, non-rebasing, non-accounting, non-upgradeable, non-paused, non-time-sensitive smart account. The two findings worth acting on are **G-1** (returndata-bomb on `withdrawFromMarketTo` — Low, cheap to fix in assembly) and **G-3** (cross-chain implementation-nonce parity — Low, deploy-script hygiene). **G-4** is a UX/semantic clean-up (Low). Everything else is informational.
