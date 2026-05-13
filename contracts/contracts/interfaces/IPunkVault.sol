// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunkVault
/// @notice External surface of `PunkVault` — a deterministic, user-owned
///         smart account for CryptoPunks custody. Holds punks across any
///         CryptoPunks-compatible market at a single address per user.
///         Protocols integrate by being approved as operators; the owner
///         uses `execute` for everything else.
/// @author 1001
interface IPunkVault {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error NotOwner();
    error NotAuthorized();
    error NotFactory();
    error NotClone();
    error AlreadyInitialized();
    error ExecutionFailed(bytes returnData);
    error ZeroAddress();

    /// @dev Deliberately not named `ApprovalForAll`: this vault's operator
    ///      role is strictly stronger than ERC-721's (it also conveys ETH
    ///      spend authority via `buyPunk` / `enterBidForPunk`). A distinct
    ///      event name + selector prevents wallets and indexers from
    ///      auto-classifying it under the ERC-721 trust model.
    event OperatorSet(address indexed operator, bool approved);

    /// @dev Indexes the vault as a smart account.
    event Executed(address indexed target, uint256 value, bytes data);

    // ─────────────────────────── Identity ─────────────────────────────────

    /// @notice The immutable owner of this vault. Bound for life at deploy
    ///         via clone immutable args.
    function owner() external view returns (address);

    /// @notice The factory that deployed every clone. The only address
    ///         allowed to call `factoryInitialize`.
    function FACTORY() external view returns (address);

    // ───────────────────────── Operator role ──────────────────────────────

    /// @notice Approves `operator` as a full-trust agent for this vault.
    ///         Operators may move any punk this vault holds on any market
    ///         (transfer to any recipient, list at any price including zero,
    ///         accept any standing bid) AND spend the vault's ETH balance
    ///         via `buyPunk` / `enterBidForPunk` up to `address(this).balance`.
    ///         There is no narrower per-punk delegation: the owner is the
    ///         only path for one-off custody moves, via `execute` or by
    ///         calling the delegated surface directly.
    /// @dev    Deliberately not named `setApprovalForAll`: this role is
    ///         strictly stronger than the ERC-721 setter of the same name,
    ///         and the distinct selector keeps wallets / integrators from
    ///         under-pricing the authority through ERC-721 heuristics.
    function setOperator(address operator, bool approved) external;

    function isOperator(address operator) external view returns (bool);

    // ──────────────── Punk market — delegated surface ─────────────────────
    //
    // Owner-or-operator gated.

    /// @notice Clean replacement for `offerPunkForSaleToAddress(.., 0, x)`:
    ///         moves a punk out of the vault without polluting the canonical
    ///         market with a zero-priced listing.
    function transferPunk(address market, uint256 punkIndex, address to) external;

    function offerPunkForSale(
        address market,
        uint256 punkIndex,
        uint256 minSalePriceWei
    ) external;

    /// @notice Lists for sale only to `toAddress`. Used by auction houses
    ///         to set up real-priced PunkBought round-trips at settlement.
    function offerPunkForSaleToAddress(
        address market,
        uint256 punkIndex,
        uint256 minSalePriceWei,
        address toAddress
    ) external;

    function punkNoLongerForSale(address market, uint256 punkIndex) external;

    /// @notice Accepts the standing bid at >= minPrice. Proceeds land in
    ///         the market's `pendingWithdrawals[vault]` — call
    ///         `withdrawFromMarket` to move them into the vault's balance.
    function acceptBidForPunk(
        address market,
        uint256 punkIndex,
        uint256 minPrice
    ) external;

    // ──────────────── Punk market — spending surface ──────────────────────
    //
    // Owner-or-operator gated. `payable` so callers may top up the vault
    // inline; `value` is what the market sees and may exceed `msg.value`
    // by drawing on existing balance. Surplus `msg.value` beyond `value`
    // stays in the vault.

    /// @notice Buys the Punk at `(market, punkIndex)`, forwarding `value`
    ///         wei to the market. Funded from any combination of the
    ///         attached `msg.value` and the vault's existing balance.
    /// @dev Owner or operator.
    function buyPunk(address market, uint256 punkIndex, uint256 value)
        external payable;

    /// @notice Places a bid on `(market, punkIndex)`, locking `value` wei
    ///         in the market. Funded as in `buyPunk`. The market refunds
    ///         any previously outbid bidder via its own `pendingWithdrawals`.
    /// @dev Owner or operator.
    function enterBidForPunk(address market, uint256 punkIndex, uint256 value)
        external payable;

    /// @notice Withdraws the vault's standing bid on `(market, punkIndex)`,
    ///         returning the locked ETH to the vault's balance.
    /// @dev Owner or operator.
    function withdrawBidForPunk(address market, uint256 punkIndex) external;

    // ─────────────────────────── Stash ────────────────────────────────────

    /// @notice The canonical Yuga Labs StashFactory on Ethereum mainnet,
    ///         used by `stash` to resolve the EOA owner's Stash address.
    function STASH_FACTORY() external view returns (address);

    /// @notice Forwards a Punk to the EOA owner's canonical Stash on Yuga
    ///         Labs' StashFactory, deploying the Stash on first use. The
    ///         Stash is owned by the EOA (not the vault), so listings,
    ///         bids, and withdrawals from the Stash proceed through normal
    ///         EOA tooling rather than this vault.
    function stash(address market, uint256 punkIndex) external;

    // ─────────────────────────── Proceeds ─────────────────────────────────

    /// @notice Pulls this vault's `pendingWithdrawals` on `market` into
    ///         the vault's ETH balance.
    /// @dev Owner-only.
    function withdrawFromMarket(address market) external;

    /// @notice Pulls this vault's `pendingWithdrawals` on `market` and
    ///         forwards the withdrawn ETH to `recipient`.
    /// @dev Owner-only. Only the ETH received from this withdraw call is
    ///      forwarded; any pre-existing vault balance remains in the vault.
    function withdrawFromMarketTo(address market, address recipient) external;

    // ──────────────── Owner-only generic execution ────────────────────────

    /// @notice Calls `target` with `value` ETH and `data`. The path for
    ///         everything the explicit punks surface doesn't cover: ERC20
    ///         claims, ENS subdomain management, ERC721 / ERC1155 sweeps,
    ///         sending ETH to the owner's wallet, future protocols.
    /// @dev    Uses CALL, never DELEGATECALL — vault state cannot be
    ///         hijacked by a misbehaving target. Revert data bubbles via
    ///         `ExecutionFailed`.
    function execute(address target, uint256 value, bytes calldata data)
        external payable returns (bytes memory);

    /// @notice Atomic batched `execute`. All-or-nothing.
    function executeBatch(Call[] calldata calls)
        external payable returns (bytes[] memory);

    // ──────────────── Factory-only one-shot init ──────────────────────────

    /// @notice Pre-approves `operators` at deploy time. Callable exactly
    ///         once, only by `FACTORY`. After this, only the owner may
    ///         change approvals via `setOperator`.
    function factoryInitialize(address[] calldata operators) external;
}
