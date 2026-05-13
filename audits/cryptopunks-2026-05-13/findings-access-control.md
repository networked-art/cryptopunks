# PunkVault / PunkVaultFactory — Access Control Audit

**Date**: 2026-05-13
**Scope**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/interfaces/IPunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/interfaces/IPunkVaultFactory.sol`

**Checklist**: `evm-audit-access-control` (austintgriffith/evm-audit-skills)

## Preamble

PunkVault is a deterministic, ERC-1167-clone-with-immutable-args smart account per user. The owner is encoded in the clone's immutable args (read via `extcodecopy` in `owner()`) and cannot be transferred or renounced. The role model is intentionally minimal:

- **owner** — immutable; gates `setOperator`, `execute`, `executeBatch`. No recovery, no rotation, no timelock.
- **operator** — set by owner via `setOperator(addr, bool)` or pre-approved once at deploy time via `factoryInitialize`. Operators are documented as full-trust agents: they can move any punk on any market, list/accept at any price, spend the full ETH balance through `buyPunk` / `enterBidForPunk`, and have free rein on the operator-gated surface.
- **FACTORY** — gates the one-shot `factoryInitialize`. The implementation itself is sealed against initialization by the constructor.

The contracts are well-scoped and the auth structure is clean. Most checklist items map cleanly to design choices the natspec already calls out. The material findings concern (a) the extent of operator power versus what the operator role's name and surface visually imply, and (b) the absence of any recovery path for a lost owner key — both by design but visible to integrators.

---

## Findings

## [AC-1] Operator can drain the vault's entire ETH balance through an attacker-controlled market
**Severity**: Medium (Info if the documented "full-trust" model is accepted verbatim)
**Category**: evm-audit-access-control
**Location**: `PunkVault.buyPunk()` (lines 143-149), `PunkVault.enterBidForPunk()` (lines 152-158)
**Description**: `buyPunk(address market, uint256 punkIndex, uint256 value)` is operator-gated and forwards `value` wei to the operator-supplied `market` address. Both `market` and `value` are operator-controlled, with the only ceiling being `address(this).balance`. The market need not be the canonical CryptoPunks market — any contract with a payable `buyPunk(uint256)` selector (or any address with a payable fallback that accepts the value-bearing call) keeps the ETH. The `IPunkVault.setOperator` natspec discloses ETH-spend authority via `buyPunk`/`enterBidForPunk` but does not emphasize that the operator also chooses the destination market. The natural reading ("spend ETH on `buyPunk`") implies a punk is acquired in exchange, which is not enforced.
**Proof of Concept**:
```
1. Owner approves operator O via setOperator(O, true).
2. Vault holds 100 ETH (proceeds, top-ups, etc.).
3. O deploys malicious "market" M with:
       function buyPunk(uint256) external payable { payable(O).transfer(msg.value); }
4. O calls vault.buyPunk(M, 0, 100 ether).
5. Vault forwards 100 ETH to M; M forwards to O. Vault holds 0 ETH, no punk transferred.
```
Same construction works against `enterBidForPunk`.
**Recommendation**: Either harden the `IPunkVault.setOperator` natspec to explicitly state that an operator can route the full ETH balance to any contract they control (not only to vetted markets), or restrict `market` to an allow-list, or split spend authority off into its own role distinct from the punk-management role.

---

## [AC-2] No owner rotation or recovery — lost owner key bricks the vault permanently
**Severity**: Medium (acknowledged design; flag-worthy)
**Category**: evm-audit-access-control
**Location**: `PunkVault.owner()` (lines 62-76); contract-wide
**Description**: `owner()` is read from the clone's immutable args; there is no setter, no two-step transfer, no renounce, no factory-mediated recovery, and no guardian hook. A lost-key owner cannot move punks, revoke operators, or call `execute` — all punks are inaccessible unless an already-approved operator rescues them (and even then operators cannot call `execute`, so non-punk assets — ERC20 airdrops, ENS names — are lost). A compromised-key owner can be defended only by an operator front-running the attacker, which is racy and assumes a watchful operator exists.
**Proof of Concept**: Not an exploit; structural property. Any single-key owner compromise is terminal.
**Recommendation**: Document prominently in `IPunkVault` that the vault is permanently bound to the owner EOA — and therefore should be owned by an account with its own recovery surface (Safe, ERC-4337 account, EIP-7702 delegated EOA). Optionally add an opt-in factory-mediated migration (owner-signed message authorizes a new owner; factory deploys a new clone and migrates punks via a one-shot helper).

---

## [AC-3] `OperatorSet` event does not distinguish factory bootstrap from owner-driven approval
**Severity**: Low
**Category**: evm-audit-access-control
**Location**: `PunkVault.factoryInitialize()` (lines 243-255)
**Description**: `factoryInitialize` emits `OperatorSet(operator, true)` — identical to `setOperator`. Indexers cannot tell whether the approval came from the owner or from the one-shot factory bootstrap. Pre-approvals at deploy time are typically chosen by whoever invokes `ensureMyVault` (frontend, script, third party); the event stream alone does not surface that distinction.
**Proof of Concept**: N/A — observational.
**Recommendation**: Emit a distinct event from `factoryInitialize` (e.g. `OperatorInitialized(operator)`), or add an indexed field to `OperatorSet` distinguishing source. The former preserves the `OperatorSet` selector for `setOperator`.

---

## [AC-4] `ensureMyVault([ops])` semantics surprise: second call reverts instead of falling through
**Severity**: Low
**Category**: evm-audit-access-control
**Location**: `PunkVaultFactory.ensureMyVault()` (lines 41-49)
**Description**: `ensureMyVault(operators)` calls `_deployIfMissing(msg.sender)` and then unconditionally calls `factoryInitialize(operators)` if `operators.length > 0`. Three entry states:
1. Not yet deployed — deploy, then init. Works as advertised.
2. Deployed but never initialized (third party called `ensureVault(msg.sender)` first) — no deploy needed; init runs; operators pre-approved. Works.
3. Deployed and already initialized — `factoryInitialize` reverts with `AlreadyInitialized`; the whole tx reverts.

State 3 is the issue: the function reverts rather than informing the caller "your vault already exists, use `setOperator`". The natspec discloses "subsequent calls revert with `AlreadyInitialized`", but the `ensure*` name implies idempotency, which only holds for the deploy half. Subtler asymmetry: passing `operators = []` silently no-ops the init half regardless of state — callers cannot rely on `ensureMyVault([])` as an "is my vault initialized?" probe.
**Proof of Concept**:
```
User runs ensureMyVault([opA]) — vault deployed + initialized with opA.
Later, user (forgetting) runs ensureMyVault([opB]).
Tx reverts with AlreadyInitialized. opB was not added.
Correct call path was vault.setOperator(opB, true).
```
**Recommendation**: Either rename to `deployMyVault` / `deployVaultWithOperators` to drop the idempotent connotation, or guard the `factoryInitialize` call so that an already-initialized vault falls through silently (requires exposing initialization state — e.g. `function isInitialized() external view`).

---

## [AC-5] Reentrancy across the operator surface when an operator is itself a contract
**Severity**: Low (operator is already full-trust; reentry does not strictly escalate)
**Category**: evm-audit-access-control
**Location**: `PunkVault.acceptBidForPunk()` (135-138), `PunkVault.buyPunk()` (143-149), `PunkVault.withdrawFromMarketTo()` (194-204)
**Description**: The vault carries no reentrancy guard. Operator-gated functions cascade through external calls to the operator-supplied `market`, which may re-enter the vault. The only meaningful auth surface inside the reentry is operator-gated (`execute` is owner-gated and a callback's `msg.sender` is not the owner). For an operator-controlled callback, the reentrant `msg.sender` is the market — so reentry needs the market to also be an approved operator for any privileged path to open. Concretely: if the owner approves a marketplace contract `M` as operator (a reasonable thing to do for a real marketplace), `M` can — during any callback from its own `acceptBidForPunk` etc. — call back into the vault and exercise the *full* operator surface (e.g. `buyPunk(attackerMarket, _, full balance)`).

`withdrawFromMarketTo` reads `balanceBefore` before the external call. If the market reenters `withdrawFromMarketTo(otherMarket, attacker)` mid-flight, the inner call's `balanceBefore` already includes the not-yet-forwarded outer withdrawal — but it only forwards its own `withdrawn` delta, so the math is safe. The auth concern is the same.
**Proof of Concept**:
```
1. Owner approves marketplace M as operator.
2. M has a callback in acceptBidForPunk that re-enters arbitrary selectors on its caller.
3. Operator (= M, via its own public trigger) calls vault.acceptBidForPunk(M, pIdx, p).
4. M re-enters vault.buyPunk(attackerMarket, _, address(this).balance).
5. Vault drains via AC-1.
```
**Recommendation**: Add a single global `nonReentrant` guard (OZ `ReentrancyGuardTransient` is one slot) on every operator-gated function, or amend `IPunkVault.setOperator` natspec to explicitly warn that approving a contract as an operator grants it reentry-time privilege across the entire operator surface.

---

## [AC-6] Instant owner authority — no timelock / multi-sig at the contract level
**Severity**: Info
**Category**: evm-audit-access-control
**Location**: `PunkVault.setOperator()` (88-93), `PunkVault.execute()` (209-219), `PunkVault.executeBatch()` (222-238)
**Description**: The owner has instant, unilateral authority to grant/revoke operator status and to call any external contract via `execute`. No timelock, no in-contract multi-sig. Per the checklist this is "instant parameter changes" and "corrupted owner can destroy the protocol", but because each vault is single-tenant (owned by exactly one user), this is the correct design — the user IS the protocol — and a timelock would only impede the legitimate owner. The mitigation is to back the vault with an account that has its own recovery / multi-sig (Safe, 4337, 7702). The vault correctly forwards 1271 via `SignatureChecker.isValidSignatureNowCalldata` (line 309), handling both EOA and contract owners.
**Proof of Concept**: N/A.
**Recommendation**: No code change. Add a one-line note in `IPunkVault.owner` natspec recommending users back the vault with a smart account that has recovery / multi-sig, since the vault itself has none.

---

## [AC-7] Implementation contract sealing — correctly handled (positive finding)
**Severity**: Info
**Category**: evm-audit-access-control
**Location**: `PunkVault` constructor (53-57); `PunkVault.owner()` (62-76); `PunkVault.factoryInitialize()` (243-255)
**Description**: The checklist's "Initializer can be called by anyone on implementation contract" is well-handled:
- Constructor sets `_initialized = true` on the implementation bytecode (line 56), so direct `factoryInitialize` on the impl reverts with `AlreadyInitialized`.
- `FACTORY` is required non-zero and bound immutable.
- `owner()` explicitly rejects calls on the bare implementation via `NotClone`, preventing `extcodecopy` from returning a misleading slice to offchain consumers.
- `_SELF` captured at construction time identifies the impl runtime correctly when clones delegate-in via the ERC-1167-with-args proxy.
**Recommendation**: None — recommended pattern, correctly applied.

---

## [AC-8] `ensureVault` permissionless deployment is safe but worth documenting
**Severity**: Info
**Category**: evm-audit-access-control
**Location**: `PunkVaultFactory.ensureVault()` (35-38)
**Description**: `ensureVault(address user)` is callable by anyone for any `user`. Safe because (a) the deployed clone has `user` as immutable owner — the caller gains no authority; (b) the clone deploys with `_initialized = false`, but only `FACTORY` can call `factoryInitialize`, and the factory exposes that path only through `ensureMyVault` (gated to `msg.sender`); (c) counterfactual deposits to `predictVault(user)` are realized once anyone triggers the deploy, by design. Griefing potential: a third-party deploy means `user`'s subsequent `ensureMyVault([ops])` still works (deploy half no-ops; init half succeeds because `_initialized` is still false). Net griefing cost: zero meaningful loss.
**Proof of Concept**: N/A.
**Recommendation**: Document on `IPunkVaultFactory.ensureVault` that the function is intentionally permissionless and that a third-party deploy does not compromise the owner's later pre-approval path.

---

## [AC-9] Roles granted in constructor are documented (positive finding)
**Severity**: Info
**Category**: evm-audit-access-control
**Location**: `PunkVault` constructor (53-57); `PunkVaultFactory` constructor (20-22)
**Description**: The only role granted at construction is `FACTORY` (on the implementation), documented in both natspec (`IPunkVault.FACTORY`) and the constructor comment. The `owner` role is encoded in clone immutable args (set by the factory at clone-deploy time, not in the impl constructor). Operators can only be added via `setOperator` or `factoryInitialize` post-deploy.
**Recommendation**: None.

---

## [AC-10] No cap on operator count
**Severity**: Info
**Category**: evm-audit-access-control
**Location**: `PunkVault.setOperator()` (88-93); `PunkVault.factoryInitialize()` (243-255)
**Description**: Operators are stored in a mapping with no count; the owner can approve unbounded operators. Each is full-trust, so adding many proportionally increases attack surface — but this is a property of single-vault user-driven approvals (analogous to uncapped ERC-20 `approve` count). `factoryInitialize` iterates an array bounded only by tx gas; since the caller is the user themselves (`ensureMyVault` is `msg.sender`-gated), no third party can pad the input.
**Recommendation**: None.

---

## Checklist Completion

| # | Checklist item | Status | Finding |
|---|---|---|---|
| 1 | Admin can perform token transfers on behalf of users | Applies | AC-1 (operator drain), AC-2 (no recovery) |
| 2 | Instant parameter changes without timelock | Applies (by design) | AC-6 |
| 3 | Total upgradeability | N/A | No upgrade path; impl fixed by factory at deploy. |
| 4 | Pausing that blocks critical user operations | N/A | No pause function. |
| 5 | Corrupted owner can destroy the protocol | Applies | AC-2, AC-6 |
| 6 | Missing access controls on sensitive functions | Reviewed — pass | All sensitive paths gated; AC-1 flags scope. |
| 7 | Two-step ownership transfer not implemented | Applies | AC-2 (no transfer at all) |
| 8 | Functions operating on other users assume msg.sender is the user | Reviewed — pass | `ensureVault(user)` is intentionally permissionless; vault remains user-owned. AC-8. |
| 9 | Whitelist bypass via proxy tokens | N/A | No token whitelist. |
| 10 | Roles granted in constructor but not documented | Pass | AC-9 |
| 11 | No cap on privileged role count | Reviewed — accepted | AC-10 |
| 12 | Renounce ownership can brick contract | Applies | AC-2 (no renounce, but loss-of-key is equivalent) |
| 13 | Initializer can be called by anyone on implementation contract | Pass | AC-7 |
| 14 | Deploy scripts not included in audit scope | Out of scope | Deploy scripts not under review. |
| 15 | When all agents are the same person | Applies (single-tenant) | Per-vault model: owner == primary user. Info. |

Additional findings beyond the strict checklist:
- AC-3: event emission collapses two distinct authorization sources.
- AC-4: factory-level idempotence asymmetry between deploy and initialize.
- AC-5: reentrancy across operator surface when operator is a contract.
