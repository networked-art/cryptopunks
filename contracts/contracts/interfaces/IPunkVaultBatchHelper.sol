// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title  IPunkVaultBatchHelper
///
/// @notice Typed batch helper surface for owner-triggered `PunksVault`
///         marketplace operations.
///
/// @author 1001
interface IPunkVaultBatchHelper {
    struct TransferPunk {
        address market;
        uint256 punkIndex;
        address to;
    }

    struct OfferPunkForSale {
        address market;
        uint256 punkIndex;
        uint256 minSalePriceWei;
    }

    struct OfferPunkForSaleToAddress {
        address market;
        uint256 punkIndex;
        uint256 minSalePriceWei;
        address toAddress;
    }

    struct PunkMarketRef {
        address market;
        uint256 punkIndex;
    }

    struct AcceptBidForPunk {
        address market;
        uint256 punkIndex;
        uint256 minPrice;
    }

    struct PayablePunkAction {
        address market;
        uint256 punkIndex;
        uint256 marketValue;
        uint256 callValue;
    }

    struct WithdrawFromMarketTo {
        address market;
        address recipient;
    }

    error ZeroAddress();
    error VaultNotDeployed();
    error NotVaultOwner();
    error HelperNotOperator();
    error ValueMismatch();

    /// @notice Factory used to derive `msg.sender`'s vault.
    function FACTORY() external view returns (address);

    function batchTransferPunks(TransferPunk[] calldata items) external;

    function batchOfferPunksForSale(OfferPunkForSale[] calldata items) external;

    function batchOfferPunksForSaleToAddress(OfferPunkForSaleToAddress[] calldata items)
        external;

    function batchPunksNoLongerForSale(PunkMarketRef[] calldata items) external;

    function batchAcceptBidsForPunk(AcceptBidForPunk[] calldata items) external;

    function batchBuyPunks(PayablePunkAction[] calldata items) external payable;

    function batchEnterBidsForPunk(PayablePunkAction[] calldata items) external payable;

    function batchWithdrawBidsForPunk(PunkMarketRef[] calldata items) external;

    function batchWithdrawFromMarkets(address[] calldata markets) external;

    function batchWithdrawFromMarketsTo(WithdrawFromMarketTo[] calldata items) external;

    function batchStashPunks(uint256[] calldata punkIndexes) external;
}
