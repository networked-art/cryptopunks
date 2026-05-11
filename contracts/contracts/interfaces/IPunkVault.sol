// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunkVault
/// @notice External surface of `PunkVault` — a deterministic, user-owned
///         smart account for CryptoPunks custody. Holds punks across any
///         CryptoPunks-compatible market at a single address per user.
///         Protocols integrate by being approved as operators, ERC721-style;
///         the owner uses `execute` for everything else.
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
    error AlreadyInitialized();
    error ExecutionFailed(bytes returnData);
    error ZeroAddress();

    /// @dev Mirrors ERC721 semantics. Per-punk approval is cleared
    ///      automatically when the punk is transferred via this vault's
    ///      market surface; not cleared if the owner uses `execute` to
    ///      call the market directly.
    event Approval(
        address indexed market,
        uint256 indexed punkIndex,
        address indexed operator
    );

    event ApprovalForAll(address indexed operator, bool approved);

    /// @dev Indexes the vault as a smart account.
    event Executed(address indexed target, uint256 value, bytes data);

    // ─────────────────────────── Identity ─────────────────────────────────

    /// @notice The immutable owner of this vault. Bound for life at deploy
    ///         via clone immutable args.
    function owner() external view returns (address);

    /// @notice The factory that deployed every clone. The only address
    ///         allowed to call `factoryInitialize`.
    function FACTORY() external view returns (address);

    // ─────────────────── Approvals (ERC721-like) ──────────────────────────

    /// @notice Approves `operator` to move the punk at `(market, punkIndex)`.
    ///         Cleared automatically when the punk is transferred via this
    ///         vault's market surface.
    function approve(address market, uint256 punkIndex, address operator) external;

    /// @notice Approves `operator` to move any punk this vault holds on
    ///         any market. Same drain-attack surface as ERC721
    ///         `setApprovalForAll` — prefer per-token approvals for one-off
    ///         integrations.
    function setApprovalForAll(address operator, bool approved) external;

    function getApproved(address market, uint256 punkIndex) external view returns (address);
    function isApprovedForAll(address operator) external view returns (bool);

    /// @notice True if `caller` may move `(market, punkIndex)` — owner,
    ///         the per-token approved address, or any operator. Convenience
    ///         for integrators that want to pre-check.
    function isAuthorized(address market, uint256 punkIndex, address caller)
        external view returns (bool);

    // ──────────────── Punk market — delegated surface ─────────────────────
    //
    // All approval-gated. Per-token approvals cleared before the external
    // call for transfer-equivalent operations (CEI).

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

    // ─────────────────────────── Proceeds ─────────────────────────────────

    /// @notice Pulls this vault's `pendingWithdrawals` on `market` into
    ///         the vault's ETH balance. Open — proceeds always belong to
    ///         the vault, so triggering this is benign.
    function withdrawFromMarket(address market) external;

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
    ///         change approvals via `setApprovalForAll`.
    function factoryInitialize(address[] calldata operators) external;
}
