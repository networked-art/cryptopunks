// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "./interfaces/IPunkVault.sol";
import "./interfaces/ICryptoPunksMarket.sol";
import "./interfaces/IStashFactory.sol";

/// @title  PunkVault
/// @notice Deterministic, user-owned smart account for CryptoPunks custody.
///         Holds Punks across every CryptoPunks-compatible market at a
///         single address per user. Protocols integrate by being approved
///         as operators; the owner uses `execute` for everything else.
///
///         No wrapping. No marketplace-listing pollution. No per-protocol
///         custody glue. The vault is the Punk's canonical owner on each
///         market; outgoing transfers go straight through `transferPunk`.
///
///         The vault is also a smart account: arbitrary `execute` calls let
///         the owner manage ENS records on the vault address, receive and
///         redeem ERC20 / ERC721 / ERC1155 tokens that flow in, and
///         integrate with protocols that don't yet exist.
/// @author 1001
contract PunkVault is IPunkVault, IERC721Receiver, IERC1155Receiver, IERC1271 {
    /// @inheritdoc IPunkVault
    address public constant STASH_FACTORY = 0x000000000000A6fA31F5fC51c1640aAc76866750;

    /// @inheritdoc IPunkVault
    address public immutable FACTORY;

    /// @dev Implementation address baked into the runtime bytecode. Clones
    ///      delegatecall into this same bytecode, so they read the impl's
    ///      address through this immutable — `address(this) == _SELF`
    ///      identifies a direct call on the bare implementation.
    address private immutable _SELF = address(this);

    /// @dev True once `factoryInitialize` has run. Pre-set on the
    ///      implementation itself by the constructor so the template
    ///      can never be hijacked.
    bool private _initialized;

    mapping(address operator => bool) private _operatorApproved;

    /// @notice Deploys the implementation. Clones inherit `FACTORY` via the
    ///         shared runtime bytecode and read `owner` from their own
    ///         immutable args.
    /// @dev    The implementation itself is sealed against `factoryInitialize`
    ///         here so it cannot be co-opted by anyone who calls it directly.
    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        FACTORY = factory_;
        _initialized = true;
    }

    // ─────────────────────────── Identity ─────────────────────────────────

    /// @inheritdoc IPunkVault
    function owner() public view returns (address ownerAddr) {
        // Reject calls on the bare implementation: it carries no immutable
        // args, so `extcodecopy` would return a deterministic-but-arbitrary
        // slice of the impl's own runtime. That value could mislead
        // `isOperator` callers and offchain indexers.
        if (address(this) == _SELF) revert NotClone();

        // The ERC-1167 proxy runtime is exactly 45 (0x2d) bytes; OZ
        // `cloneDeterministicWithImmutableArgs` appends our 20 bytes of
        // owner directly after.
        assembly ("memory-safe") {
            extcodecopy(address(), 0x00, 0x2d, 0x14)
            ownerAddr := shr(96, mload(0x00))
        }
    }

    // ─────────────────────────── Receive ──────────────────────────────────

    /// @notice Accept ETH from anywhere. Punks-market `withdraw()` requires
    ///         it, and the vault is a smart account that may receive
    ///         arbitrary inbound transfers (airdrops, ENS refunds, etc.).
    receive() external payable {}

    // ───────────────────────── Operator role ──────────────────────────────

    /// @inheritdoc IPunkVault
    function setOperator(address operator, bool approved) external {
        if (msg.sender != owner()) revert NotOwner();
        if (operator == address(0)) revert ZeroAddress();
        _operatorApproved[operator] = approved;
        emit OperatorSet(operator, approved);
    }

    /// @inheritdoc IPunkVault
    function isOperator(address operator) external view returns (bool) {
        return _operatorApproved[operator];
    }

    // ──────────────── Punk market — delegated surface ─────────────────────

    /// @inheritdoc IPunkVault
    function transferPunk(address market, uint256 punkIndex, address to) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).transferPunk(to, punkIndex);
    }

    /// @inheritdoc IPunkVault
    function offerPunkForSale(address market, uint256 punkIndex, uint256 minSalePriceWei)
        external
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).offerPunkForSale(punkIndex, minSalePriceWei);
    }

    /// @inheritdoc IPunkVault
    function offerPunkForSaleToAddress(
        address market,
        uint256 punkIndex,
        uint256 minSalePriceWei,
        address toAddress
    ) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market)
            .offerPunkForSaleToAddress(punkIndex, minSalePriceWei, toAddress);
    }

    /// @inheritdoc IPunkVault
    function punkNoLongerForSale(address market, uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).punkNoLongerForSale(punkIndex);
    }

    /// @inheritdoc IPunkVault
    function acceptBidForPunk(address market, uint256 punkIndex, uint256 minPrice) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).acceptBidForPunk(punkIndex, minPrice);
    }

    // ──────────────── Punk market — spending surface ──────────────────────

    /// @inheritdoc IPunkVault
    function buyPunk(address market, uint256 punkIndex, uint256 value)
        external
        payable
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).buyPunk{value: value}(punkIndex);
    }

    /// @inheritdoc IPunkVault
    function enterBidForPunk(address market, uint256 punkIndex, uint256 value)
        external
        payable
    {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).enterBidForPunk{value: value}(punkIndex);
    }

    /// @inheritdoc IPunkVault
    function withdrawBidForPunk(address market, uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).withdrawBidForPunk(punkIndex);
    }

    // ─────────────────────────── Stash ────────────────────────────────────

    /// @inheritdoc IPunkVault
    /// @dev    The Stash CREATE2 derivation is owner-keyed, so the vault
    ///         and its EOA owner resolve to different Stashes — sending
    ///         to `stashAddressFor(owner())` lands the Punk in the EOA's
    ///         existing Stash (or a freshly deployed one), where it can be
    ///         used without needing the vault to implement ERC-1271 or
    ///         satisfy Stash's `tx.origin == owner` checks.
    function stash(address market, uint256 punkIndex) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        address eoaOwner = owner();
        address stashAddr = IStashFactory(STASH_FACTORY).stashAddressFor(eoaOwner);
        if (stashAddr.code.length == 0) {
            IStashFactory(STASH_FACTORY).deployStash(eoaOwner);
        }
        ICryptoPunksMarket(market).transferPunk(stashAddr, punkIndex);
    }

    // ─────────────────────────── Proceeds ─────────────────────────────────

    /// @inheritdoc IPunkVault
    function withdrawFromMarket(address market) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        ICryptoPunksMarket(market).withdraw();
    }

    /// @inheritdoc IPunkVault
    function withdrawFromMarketTo(address market, address recipient) external {
        if (!_isOwnerOrOperator(msg.sender)) revert NotAuthorized();
        if (recipient == address(0)) revert ZeroAddress();
        uint256 balanceBefore = address(this).balance;
        ICryptoPunksMarket(market).withdraw();
        uint256 withdrawn = address(this).balance - balanceBefore;
        if (withdrawn != 0) {
            (bool ok, bytes memory ret) = recipient.call{value: withdrawn}("");
            if (!ok) revert ExecutionFailed(ret);
        }
    }

    // ──────────────── Owner-only generic execution ────────────────────────

    /// @inheritdoc IPunkVault
    function execute(address target, uint256 value, bytes calldata data)
        external
        payable
        returns (bytes memory)
    {
        if (msg.sender != owner()) revert NotOwner();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(ret);
        emit Executed(target, value, data);
        return ret;
    }

    /// @inheritdoc IPunkVault
    function executeBatch(Call[] calldata calls)
        external
        payable
        returns (bytes[] memory results)
    {
        if (msg.sender != owner()) revert NotOwner();
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

    // ──────────────── Factory-only one-shot init ──────────────────────────

    /// @inheritdoc IPunkVault
    function factoryInitialize(address[] calldata operators) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        uint256 len = operators.length;
        for (uint256 i; i < len;) {
            address op = operators[i];
            if (op == address(0)) revert ZeroAddress();
            _operatorApproved[op] = true;
            emit OperatorSet(op, true);
            unchecked { ++i; }
        }
    }

    // ──────────────── Token receiver hooks ────────────────────────────────

    /// @notice Accepts any ERC721 transferred via `safeTransferFrom`. The
    ///         vault is a smart account; receipts are not gated.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Accepts any ERC1155 transferred via `safeTransferFrom`.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /// @notice Accepts any ERC1155 batch.
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    // ──────────────── ERC-1271 ────────────────────────────────────────────

    /// @notice EIP-1271 signature check. The vault is a valid signer of any
    ///         hash the owner has signed — directly via ECDSA if the owner
    ///         is an EOA, or by forwarding to the owner's own 1271 surface
    ///         if the owner is itself a contract account (Safe, 4337, 7702).
    /// @dev    Lets the vault address participate as a first-class signer
    ///         in Seaport / Permit2 / SIWE / Snapshot and any other protocol
    ///         that consumes 1271, without exposing the owner EOA.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        return SignatureChecker.isValidSignatureNowCalldata(owner(), hash, signature)
            ? IERC1271.isValidSignature.selector
            : bytes4(0xffffffff);
    }

    // ──────────────── ERC-165 ─────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IPunkVault).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId
            || interfaceId == type(IERC1271).interfaceId
            || interfaceId == 0x01ffc9a7; // ERC-165 itself
    }

    // ─────────────────────────── Internals ────────────────────────────────

    /// @dev The vault's single auth tier: owner or any operator. Used for
    ///      every non-owner-only path; gates both the delegated market
    ///      surface and the ETH-spending surface.
    function _isOwnerOrOperator(address caller) private view returns (bool) {
        return caller == owner() || _operatorApproved[caller];
    }
}
