# Proxy & Upgrade Audit — PunkVault / PunkVaultFactory

**Date**: 2026-05-13
**Auditor scope**: `evm-audit-proxies` checklist
**Files audited**:
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVault.sol`
- `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/PunkVaultFactory.sol`
- (interface context) `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/interfaces/IPunkVault.sol`
- (interface context) `/home/jalil/1001/networked_art/cryptopunks/contracts/contracts/interfaces/IPunkVaultFactory.sol`

## Architecture summary (as designed)

`PunkVaultFactory` deploys a single `PunkVault` implementation in its constructor
(`new PunkVault(address(this))`) and uses
`Clones.cloneDeterministicWithImmutableArgs(IMPLEMENTATION, abi.encodePacked(user), salt)`
to mint per-user ERC-1167 minimal proxies with the owner's 20-byte address
appended as immutable args. The clone's `owner()` reads those bytes via
`extcodecopy(address(), 0x00, 0x2d, 0x14)`. There is no upgrade path — clones
delegatecall into a fixed `IMPLEMENTATION` for life.

Initialization protections:
- Implementation seals itself in its constructor: `_initialized = true` and
  `FACTORY = factory_` are written before any external call is possible.
- `factoryInitialize` is gated on `msg.sender == FACTORY` AND `!_initialized`.
- `owner()` reverts with `NotClone` when `address(this) == _SELF`, so calls
  against the bare implementation can't be confused for a clone.

## Findings

## [P-1] Future-portability note: vault correctness depends on the absence of `SELFDESTRUCT` / `DELEGATECALL`
**Severity**: Info
**Category**: evm-audit-proxies
**Location**: `PunkVault.execute()`, `PunkVault.executeBatch()`, full contract
**Description**: `Clones.cloneDeterministicWithImmutableArgs` deploys via
CREATE2. The clone's runtime is the standard 45-byte ERC-1167 minimal proxy
plus 20 bytes of immutable args — no `SELFDESTRUCT` opcode. The implementation
also contains no `SELFDESTRUCT`. So the metamorphic-rug vector (checklist items
12/13/26) is structurally closed for this system. Recorded as Info so the
finding is explicit: any future change that introduces `SELFDESTRUCT` (or
`DELEGATECALL` to something that does) into either contract reopens this hole.
Post-Dencun `SELFDESTRUCT` only drains ETH on mainnet, but pre-Dencun L2s
still actually destroy the contract, so future-portability across L2s should
keep this invariant.
**Proof of Concept**: Not exploitable today.
**Recommendation**: Add a one-line invariant comment near the `execute` /
`executeBatch` block reminding maintainers that the vault's `execute` must
remain a `CALL` (never `DELEGATECALL`) — currently only the interface
NatSpec carries that note.

## [P-2] `ensureVault` allows third-party deploy; behaviour of one-shot init across that path should be made explicit
**Severity**: Info
**Category**: evm-audit-proxies
**Location**: `PunkVaultFactory.ensureVault()` / `ensureMyVault()` /
`PunkVault.factoryInitialize()`
**Description**: Anyone can call `ensureVault(alice)` and deploy Alice's
vault. The clone's `_initialized` storage slot starts `false` (the impl
constructor's `_initialized = true` write lands in the impl's storage, not
the clone's). So Alice can still call `ensureMyVault([ops])` after a
third-party deploy and `factoryInitialize` will run on her clone — the
"one-shot init via factory" guarantee survives the front-run. The third
party pays gas for nothing; Alice is not griefed beyond paying nothing
herself. Worth flagging only because it's the closest thing to an
init-front-running concern (checklist items 9/23) in this design and someone
re-reading the contract later might assume it is one.
**Proof of Concept**:
1. Bob calls `factory.ensureVault(alice)`. Vault deployed at
   `predictVault(alice)`, `vault._initialized == false`.
2. Alice calls `factory.ensureMyVault([X, Y])`.
3. `_deployIfMissing(alice)` sees `vault.code.length != 0`, returns existing
   vault.
4. `IPunkVault(vault).factoryInitialize([X, Y])` runs — `msg.sender == FACTORY`
   passes, `!_initialized` passes, X and Y get approved.
**Recommendation**: No code change. Optionally add a NatSpec line to
`ensureVault` clarifying that the open deploy does NOT consume the
`factoryInitialize` one-shot — that's the part a reviewer might miss.

## [P-3] `OperatorSet(op, true)` from `factoryInitialize` is indistinguishable from a `setOperator` event
**Severity**: Info
**Category**: evm-audit-proxies (event-related, included for completeness)
**Location**: `PunkVault.factoryInitialize()`
**Description**: Not a proxy bug, surfaced incidentally while walking the
init path. `factoryInitialize` emits the same `OperatorSet(op, approved)`
event as user-driven `setOperator`. Offchain indexers that try to
distinguish "deployed-with" vs "added-by-owner" operators cannot do so from
events alone — they would have to infer it from the `VaultDeployed` event
ordering. This is consistent with the rest of the design (operators are
operators regardless of provenance) and the NatSpec on the event explains
its strict semantics. Listing only so the reviewer can decide.
**Proof of Concept**: N/A.
**Recommendation**: Optional — emit a distinct `InitialOperatorSet` event
from `factoryInitialize`, or accept the current behaviour. The author's
explicit decision to use a non-`ApprovalForAll` event name suggests the
event-naming choices are deliberate, so this may be intentional.

## Non-findings (mechanically considered, not applicable)

The following items were walked and found N/A or correctly handled. None
warrant a numbered finding; they're listed here so the user can see they
were considered.

- **Item 1 — `_authorizeUpgrade()` access control**: N/A. Not UUPS. No
  upgrade entry point exists.
- **Item 2 — `disableInitializers()` in implementation constructor**:
  Handled. The constructor sets `_initialized = true` on the impl, which
  is the project's custom equivalent of OZ `_disableInitializers()`. Direct
  calls to `factoryInitialize` on the impl revert with `AlreadyInitialized`.
- **Item 3 / 21 — `selfdestruct` or `delegatecall` in implementation**:
  Handled. No `SELFDESTRUCT` anywhere. `execute()` / `executeBatch()` use
  `CALL`, not `DELEGATECALL`. (Implicitly documented in the interface
  NatSpec; see P-1 for a suggestion to mirror that comment in the impl.)
- **Item 4 / 20 — Immutable variables lost on upgrade**: N/A. No upgrades.
  `FACTORY` and `_SELF` are baked into the impl runtime and are read by
  clones via delegatecall — they survive every clone deploy by construction
  because there is exactly one impl.
- **Item 5 / 19 — Storage variable order/type cannot change**: N/A. No
  upgrades.
- **Item 6 — Storage gaps for inheritance hierarchies**: N/A. No upgrade
  path; the contract inherits only interfaces (no storage).
- **Item 7 / 22 — No constructor in proxy implementations**: Carefully
  considered. The implementation DOES have a constructor, but it is
  intentional: it (a) sets the `FACTORY` immutable, which is encoded into
  the impl's runtime bytecode and is therefore visible to every clone via
  delegatecall, and (b) writes `_initialized = true` to the impl's own
  storage, which seals the impl against direct hijack. The constructor's
  storage write does NOT propagate to clones (clones have fresh storage),
  which is the correct behaviour here. So the rule's underlying concern
  ("state set in constructor invisible to proxy") is honoured: the impl
  intentionally relies on it.
- **Item 8 / 24 — Use upgradeable versions of inherited contracts**: N/A.
  The only inherited contracts are interfaces (`IPunkVault`,
  `IERC721Receiver`, `IERC1155Receiver`, `IERC1271`). The OZ helpers used
  (`SignatureChecker`, `Clones`) are stateless libraries / pure function
  collections; they have no constructor state.
- **Item 9 / 23 — Deployer must call initialize**: Handled. The factory's
  `ensureMyVault` path performs deploy + `factoryInitialize` atomically.
  The `ensureVault` path skips init but the one-shot is preserved for the
  owner (see P-2).
- **Item 10 — Initializable storage slot reuse**: N/A. Not upgradeable; the
  `_initialized` slot is a plain `bool` in slot 0, not the OZ Initializable
  slot. There is no path that swaps implementations, so no reuse risk.
- **Item 11 / 25 — Function selector clashing in transparent proxies**:
  N/A. ERC-1167 minimal proxies don't expose admin functions — they
  unconditionally delegatecall.
- **Item 12 / 13 / 26 — Metamorphic CREATE2 + selfdestruct**: Handled by
  construction. See P-1.
- **Item 14 — `EXTCODESIZE` bypass via pre-deployment CREATE2 address**:
  Acknowledged. `predictVault(user)` is publicly documented as a
  counterfactual address; the design explicitly invites pre-deployment
  deposits to it. No code path treats "code at predicted address" as a
  trust gate. `_deployIfMissing` uses `vault.code.length != 0` solely as
  an idempotency check (avoid re-deploy), not as authorization.
- **Item 15 — `isContract()` bypass via constructor execution**: N/A.
  Clones have no constructor (ERC-1167 minimal proxy). The impl's
  constructor runs only once at impl deploy and cannot be re-triggered.
- **Items 16–18 — Storage collision / packing / shadowing**: N/A. Only
  two storage slots used (`_initialized` at slot 0, `_operatorApproved`
  mapping rooted at slot 1). No packing across slot boundaries, no
  inheritance of stateful contracts. Clones-with-immutable-args appends
  bytes to bytecode, not to storage — no collision risk.
- **Item 27 — Cross-chain upgradability asymmetry**: N/A. The system is
  non-upgradeable on every chain by construction.
- **Item 28 — Uninitialized implementation hijack**: Handled. `_initialized
  = true` baked in by the impl constructor; `factoryInitialize` reverts
  with `AlreadyInitialized` against any direct caller.
- **Item 29 — UUPS delegatecall-to-selfdestruct**: N/A. Not UUPS, no
  `upgradeToAndCall`, no `DELEGATECALL` anywhere in the impl.
- **Items 30 / 31 / 32 — UUPS upgrade-chain / overriding upgrade /
  authorization-schema change**: N/A. No upgrade path.

Additional cross-checks performed:

- **`predictDeterministic*` vs `cloneDeterministic*` arg parity**: Both
  call sites pass `IMPLEMENTATION`, `abi.encodePacked(user)`, and
  `_salt(user)`. `predictVault` additionally passes `address(this)` (the
  factory). Parity holds; predicted address will match the actual
  deployment.
- **`FACTORY` preservation through delegatecall**: `FACTORY` is `immutable`
  → baked into the impl's runtime bytecode. Clones execute the impl's
  bytecode via `DELEGATECALL`, so reads of `FACTORY` resolve against the
  impl's bytecode and yield the same value the impl was constructed with.
  Verified by inspection — there is no per-clone shadow of `FACTORY`.
- **`_SELF` semantics through delegatecall**: Same mechanism as `FACTORY`.
  Clones read `_SELF == <impl address>`, so `address(this) == _SELF`
  correctly identifies "called directly on the impl" vs "called on a
  clone via delegatecall".
- **`owner()` `extcodecopy` offset arithmetic**: The OZ
  `cloneDeterministicWithImmutableArgs` runtime is the standard 45-byte
  (0x2d) ERC-1167 minimal proxy with `abi.encodePacked(user)` (20 bytes,
  0x14) appended. `extcodecopy(address(), 0x00, 0x2d, 0x14)` writes the
  20 owner bytes to memory[0x00..0x14]. `mload(0x00)` reads a 32-byte
  word starting at 0x00; the high 20 bytes are the owner, the low 12
  bytes are whatever was in scratch (irrelevant). `shr(96, …)` shifts the
  word right by 96 bits = 12 bytes, leaving the 20-byte owner in the
  low 160 bits. Correct regardless of scratch contents.
- **`_initialized` slot layout**: `bool _initialized` at slot 0 on the
  impl (constructor sets to `true`); clone has fresh storage so its
  slot 0 starts `0`. `factoryInitialize` flips it to `1`. No risk of a
  clone reading the impl's `_initialized` value because storage is
  per-contract under `DELEGATECALL`.
- **`execute` / `executeBatch` delegation surface**: Both use `CALL`, not
  `DELEGATECALL`. A malicious `target` cannot write the vault's storage
  nor `SELFDESTRUCT` it — confirmed by code inspection of lines
  `target.call{value: value}(data)` and `c.target.call{value: c.value}(c.data)`.

## Checklist completion

| # | Item | Status | Note |
|---|------|--------|------|
| 1 | UUPS `_authorizeUpgrade()` access control | N/A | Not UUPS |
| 2 | `disableInitializers()` in impl constructor | Handled | `_initialized = true` in ctor |
| 3 | No `selfdestruct` / `delegatecall` in impl | Handled | None present; see P-1 |
| 4 | Immutable lost on upgrade | N/A | No upgrades |
| 5 | Storage var order/type cannot change | N/A | No upgrades |
| 6 | Storage gaps for inheritance | N/A | No upgradeable inheritance |
| 7 | No constructor in proxy implementations | Considered | Intentional impl ctor; see write-up |
| 8 | Upgradeable OZ base contracts | N/A | Only stateless deps |
| 9 | Deployer must call initialize | Handled | `ensureMyVault` atomic; see P-2 |
| 10 | Initializable slot reuse | N/A | Not upgradeable |
| 11 | Transparent-proxy selector clash | N/A | ERC-1167, no admin selectors |
| 12 | CREATE2 + selfdestruct metamorphism | Handled | No SELFDESTRUCT; see P-1 |
| 13 | 4 contract states | Handled | No path to "self-destructed" |
| 14 | EXTCODESIZE bypass via pre-deploy addr | Acknowledged | Counterfactual deposits intended |
| 15 | `isContract()` bypass via constructor | N/A | Clones have no constructor |
| 16 | Cross-slot boundary off-by-one | N/A | No packing |
| 17 | Multiplier/weight index misalignment | N/A | No such layout |
| 18 | Variable name collisions | N/A | No shadowing; no stateful inheritance |
| 19 | Storage collision old↔new impl | N/A | No upgrades |
| 20 | Immutables not preserved across upgrades | N/A | No upgrades |
| 21 | `selfdestruct` / `delegatecall` in impl | Handled | Same as 3 |
| 22 | No constructor in impl | Considered | Same as 7 |
| 23 | Forgot to call `initialize()` | Handled | Same as 9; see P-2 |
| 24 | Using non-upgradeable base contracts | N/A | Same as 8 |
| 25 | Function clashing transparent proxies | N/A | Same as 11 |
| 26 | Metamorphic rug via CREATE2 | Handled | Same as 12 |
| 27 | Cross-chain upgradability asymmetry | N/A | Immutable everywhere |
| 28 | Uninit'd impl — anyone becomes owner | Handled | `_initialized` sealed in ctor |
| 29 | Delegatecall→selfdestruct in UUPS impl | N/A | Not UUPS |
| 30 | Bricking upgrade chain via non-UUPS impl | N/A | No upgrades |
| 31 | Overriding `upgradeToAndCall` breaks upgrades | N/A | No upgrades |
| 32 | Auth-schema change during upgrade | N/A | No upgrades |

### Summary

No findings above Info severity. The non-upgradeable clones-with-immutable-args
design closes most of the checklist by construction; the items that DO apply
(impl-init sealing, no SELFDESTRUCT, init-front-running, predictDeterministic
parity, FACTORY preserved through delegatecall, no DELEGATECALL in `execute`)
are all correctly handled. The three Info notes are documentation suggestions
and a clarification on the open `ensureVault` deploy, not bugs.
