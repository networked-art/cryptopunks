// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./interfaces/IPunkVaultBatchHelper.sol";
import "./interfaces/IPunksVault.sol";
import "./interfaces/IPunksVaultFactory.sol";
import "./interfaces/IReverseRegistrar.sol";

/// @title  PunkVaultBatchHelper
/// @notice Immutable, owner-triggered batch helper for `PunksVault`.
///
///         Users approve this contract as a vault operator, then call typed
///         batch methods from the vault owner's address. The helper only ever
///         operates on `msg.sender`'s predicted vault, keeping the vault's
///         broad operator role from becoming a public execution surface.
///
/// @author 1001
contract PunkVaultBatchHelper is IPunkVaultBatchHelper {
    /// @notice Canonical ENS L1 Reverse Registrar.
    address private constant REVERSE_REGISTRAR =
        0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb;

    /// @inheritdoc IPunkVaultBatchHelper
    address public immutable FACTORY;

    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        FACTORY = factory_;

        IReverseRegistrar(REVERSE_REGISTRAR).setName("batch.punksvaultfactory.eth");
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchTransferPunks(TransferPunk[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            TransferPunk calldata item = items[i];
            vault.transferPunk(item.market, item.punkIndex, item.to);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchOfferPunksForSale(OfferPunkForSale[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            OfferPunkForSale calldata item = items[i];
            vault.offerPunkForSale(item.market, item.punkIndex, item.minSalePriceWei);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchOfferPunksForSaleToAddress(OfferPunkForSaleToAddress[] calldata items)
        external
    {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            OfferPunkForSaleToAddress calldata item = items[i];
            vault.offerPunkForSaleToAddress(
                item.market,
                item.punkIndex,
                item.minSalePriceWei,
                item.toAddress
            );
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchPunksNoLongerForSale(PunkMarketRef[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            PunkMarketRef calldata item = items[i];
            vault.punkNoLongerForSale(item.market, item.punkIndex);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchAcceptBidsForPunk(AcceptBidForPunk[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            AcceptBidForPunk calldata item = items[i];
            vault.acceptBidForPunk(item.market, item.punkIndex, item.minPrice);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchBuyPunks(PayablePunkAction[] calldata items) external payable {
        _requireExactValue(items);
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            PayablePunkAction calldata item = items[i];
            vault.buyPunk{value: item.callValue}(
                item.market,
                item.punkIndex,
                item.marketValue
            );
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchEnterBidsForPunk(PayablePunkAction[] calldata items)
        external
        payable
    {
        _requireExactValue(items);
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            PayablePunkAction calldata item = items[i];
            vault.enterBidForPunk{value: item.callValue}(
                item.market,
                item.punkIndex,
                item.marketValue
            );
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchWithdrawBidsForPunk(PunkMarketRef[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            PunkMarketRef calldata item = items[i];
            vault.withdrawBidForPunk(item.market, item.punkIndex);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchWithdrawFromMarkets(address[] calldata markets) external {
        IPunksVault vault = _callerVault();
        uint256 len = markets.length;
        for (uint256 i; i < len;) {
            vault.withdrawFromMarket(markets[i]);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchWithdrawFromMarketsTo(WithdrawFromMarketTo[] calldata items) external {
        IPunksVault vault = _callerVault();
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            WithdrawFromMarketTo calldata item = items[i];
            vault.withdrawFromMarketTo(item.market, item.recipient);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPunkVaultBatchHelper
    function batchStashPunks(uint256[] calldata punkIndexes) external {
        IPunksVault vault = _callerVault();
        uint256 len = punkIndexes.length;
        for (uint256 i; i < len;) {
            vault.stash(punkIndexes[i]);
            unchecked { ++i; }
        }
    }

    function _callerVault() private view returns (IPunksVault vault) {
        address vaultAddr = IPunksVaultFactory(FACTORY).predictVault(msg.sender);
        if (vaultAddr.code.length == 0) revert VaultNotDeployed();

        vault = IPunksVault(vaultAddr);
        if (vault.owner() != msg.sender) revert NotVaultOwner();
        if (!vault.isOperator(address(this))) revert HelperNotOperator();
    }

    function _requireExactValue(PayablePunkAction[] calldata items) private {
        uint256 total;
        uint256 len = items.length;
        for (uint256 i; i < len;) {
            total += items[i].callValue;
            unchecked { ++i; }
        }
        if (total != msg.value) revert ValueMismatch();
    }
}
