// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC1271} from "solady/src/accounts/ERC1271.sol";
import {Receiver} from "solady/src/accounts/Receiver.sol";

import "./interfaces/IPunksVault.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IStashFactory.sol";

/// @title  PunksVault
/// @notice Deterministic, user-owned smart account for CryptoPunks custody.
///
///         Protocols integrate as approved operators on the vault, so they can
///         manage canonical punks with the same flexibility as wrapped assets
///         while ensuring sales clear through the original CryptoPunksMarket.
///
///         The owner uses `execute` and `isValidSignature` for everything else.
/// @author 1001
contract PunksVault is IPunksVault, Receiver, ERC1271 {
    /// @inheritdoc IPunksVault
    address public immutable FACTORY;

    /// @inheritdoc IPunksVault
    address public constant CRYPTOPUNKS = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;

    /// @inheritdoc IPunksVault
    address public constant CRYPTOPUNKS_V1 = 0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D;

    /// @inheritdoc IPunksVault
    address public constant STASH_FACTORY = 0x000000000000A6fA31F5fC51c1640aAc76866750;

    /// @inheritdoc IPunksVault
    address public owner;

    /// @dev True once `factoryInitialize` has run. Pre-set on the
    ///      implementation itself by the constructor so the template
    ///      can never be hijacked.
    bool private _initialized;

    /// @dev Tracks operators authorized to invoke owner-or-operator
    ///      gated flows.
    mapping(address operator => bool) private _operatorApproved;

    /// @notice Deploys the implementation. Clones inherit `FACTORY` via the
    ///         shared runtime bytecode and receive their owner through
    ///         `factoryInitialize`.
    /// @dev    The implementation itself is sealed against `factoryInitialize`
    ///         here so it cannot be co-opted by anyone who calls it directly.
    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        FACTORY = factory_;
        _initialized = true;
    }

    // ─────────────────────────────── Operator role ───────────────────────────────

    /// @inheritdoc IPunksVault
    function setOperator(address operator, bool approved) external {
        if (msg.sender != owner) revert NotOwner();
        if (operator == address(0)) revert ZeroAddress();
        if (_operatorApproved[operator] == approved) return;
        _operatorApproved[operator] = approved;
        emit OperatorSet(operator, approved);
    }

    /// @inheritdoc IPunksVault
    function isOperator(address operator) external view returns (bool) {
        return _operatorApproved[operator];
    }

    // ────────────────────── Punk market — delegated surface ──────────────────────

    /// @inheritdoc IPunksVault
    function transferPunk(address market, uint256 punkIndex, address to) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).transferPunk(to, punkIndex);
    }

    /// @inheritdoc IPunksVault
    function offerPunkForSale(address market, uint256 punkIndex, uint256 minSalePriceWei)
        external
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        _requireNoBrokenV1SaleMarket(market);
        ICryptoPunksMarket(market).offerPunkForSale(punkIndex, minSalePriceWei);
    }

    /// @inheritdoc IPunksVault
    function offerPunkForSaleToAddress(
        address market,
        uint256 punkIndex,
        uint256 minSalePriceWei,
        address toAddress
    ) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        _requireNoBrokenV1SaleMarket(market);
        ICryptoPunksMarket(market)
            .offerPunkForSaleToAddress(punkIndex, minSalePriceWei, toAddress);
    }

    /// @inheritdoc IPunksVault
    function punkNoLongerForSale(address market, uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).punkNoLongerForSale(punkIndex);
    }

    /// @inheritdoc IPunksVault
    function acceptBidForPunk(address market, uint256 punkIndex, uint256 minPrice) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).acceptBidForPunk(punkIndex, minPrice);
    }

    // ────────────────────── Punk market — spending surface ───────────────────────

    /// @inheritdoc IPunksVault
    function buyPunk(address market, uint256 punkIndex, uint256 value)
        external
        payable
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        _requireNoBrokenV1SaleMarket(market);
        ICryptoPunksMarket(market).buyPunk{value: value}(punkIndex);
    }

    /// @inheritdoc IPunksVault
    function enterBidForPunk(address market, uint256 punkIndex, uint256 value)
        external
        payable
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).enterBidForPunk{value: value}(punkIndex);
    }

    /// @inheritdoc IPunksVault
    function withdrawBidForPunk(address market, uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).withdrawBidForPunk(punkIndex);
    }

    // ───────────────────────────────── Proceeds ──────────────────────────────────

    /// @inheritdoc IPunksVault
    function withdrawFromMarket(address market) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).withdraw();
    }

    /// @inheritdoc IPunksVault
    function withdrawFromMarketTo(address market, address recipient) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        if (recipient == address(0)) revert ZeroAddress();
        uint256 pending = ICryptoPunksMarket(market).pendingWithdrawals(address(this));
        uint256 balanceBefore = address(this).balance;
        ICryptoPunksMarket(market).withdraw();
        uint256 withdrawn = address(this).balance - balanceBefore;
        // Cap at pre-call pending so any other ETH that lands here mid-call isn't forwarded.
        if (withdrawn > pending) withdrawn = pending;
        if (withdrawn != 0) {
            (bool ok, bytes memory ret) = recipient.call{value: withdrawn}("");
            if (!ok) revert ExecutionFailed(ret);
        }
    }

    // ─────────────────────────────────── Stash ───────────────────────────────────

    /// @inheritdoc IPunksVault
    /// @dev    The Stash CREATE2 derivation is owner-keyed, so the vault
    ///         and its EOA owner resolve to different Stashes — sending
    ///         to `stashAddressFor(owner)` lands the Punk in the EOA's
    ///         existing Stash (or a freshly deployed one).
    function stash(uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        address eoaOwner = owner;
        address stashAddr = IStashFactory(STASH_FACTORY).stashAddressFor(eoaOwner);
        if (stashAddr.code.length == 0) {
            IStashFactory(STASH_FACTORY).deployStash(eoaOwner);
        }
        ICryptoPunksMarket(CRYPTOPUNKS).transferPunk(stashAddr, punkIndex);
    }

    // ─────────────────────── Owner-only generic execution ────────────────────────

    /// @inheritdoc IPunksVault
    function execute(address target, uint256 value, bytes calldata data)
        external
        payable
        returns (bytes memory)
    {
        if (msg.sender != owner) revert NotOwner();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(ret);
        emit Executed(target, value, data);
        return ret;
    }

    /// @inheritdoc IPunksVault
    function executeBatch(Call[] calldata calls)
        external
        payable
        returns (bytes[] memory results)
    {
        if (msg.sender != owner) revert NotOwner();
        uint256 len = calls.length;
        results = new bytes[](len);
        for (uint256 i; i < len;) {
            Call calldata c = calls[i];
            (bool ok, bytes memory ret) = c.target.call{value: c.value}(c.data);
            if (!ok) revert ExecutionFailed(ret);
            results[i] = ret;
            emit Executed(c.target, c.value, c.data);
            unchecked { ++i; }
        }
    }

    // ───────────────────────── Factory-only setup paths ─────────────────────────

    /// @inheritdoc IPunksVault
    function factoryInitialize(address owner_, address[] calldata operators) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        _initialized = true;
        _setOperators(operators);
    }

    /// @inheritdoc IPunksVault
    function factoryApproveOperators(
        address expectedOwner,
        address[] calldata operators
    ) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (owner != expectedOwner) revert NotOwner();
        _setOperators(operators);
    }

    // ───────────────────────────────── Internals ─────────────────────────────────

    function _setOperators(address[] calldata operators) private {
        uint256 len = operators.length;
        for (uint256 i; i < len;) {
            address op = operators[i];
            if (op == address(0)) revert ZeroAddress();
            if (!_operatorApproved[op]) {
                _operatorApproved[op] = true;
                emit OperatorSet(op, true);
            }
            unchecked { ++i; }
        }
    }

    /// @dev The vault's single auth tier: owner or any operator. Used for
    ///      every non-owner-only path; gates both the delegated market
    ///      surface and the ETH-spending surface.
    function _isOwnerOrOperator(address caller) private view returns (bool) {
        return caller == owner || _operatorApproved[caller];
    }

    function _requireNoBrokenV1SaleMarket(address market) private pure {
        if (market == CRYPTOPUNKS_V1) revert BrokenPunksV1MarketUnsupported();
    }

    function _domainNameAndVersion()
        internal
        pure
        override
        returns (string memory name, string memory version)
    {
        name = "PunksVault";
        version = "1";
    }

    function _erc1271Signer() internal view override returns (address) {
        return owner;
    }
}
