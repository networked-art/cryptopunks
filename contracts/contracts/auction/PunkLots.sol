// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../interfaces/IPunksAuction.sol";

/// @title  PunkLots
///
/// @notice Stored seller lots and per-Punk lot reservations for the auction house.
///
/// @dev    The concrete auction contract supplies the vault and market-specific
///         hooks used to validate custody and release reservations.
///
/// @author VV × 1001
abstract contract PunkLots is IPunksAuction {
    /// @notice Maximum Punks per lot.
    uint8 internal constant MAX_LOT_ITEMS = 80;
    /// @notice Total item weight expected across a lot.
    uint16 internal constant TOTAL_WEIGHT_BPS = 10_000;

    /// @notice Returns the last lot id that was created.
    uint256 public lastLotId;

    /// @notice Returns the scalar fields of a lot (items via `getLotItems`).
    mapping(uint256 => Lot) public lots;
    /// @notice Returns the active lot id holding a seller's Punk, or 0 if none.
    /// @dev    Keyed by `keccak256(seller, tokenContract, punkId)`. A non-zero
    ///         entry reserves that Punk for one lot at a time — first-wins.
    mapping(bytes32 => uint256) public lotForPunk;

    /// @dev Dynamic item arrays for stored lots, keyed by lot id.
    mapping(uint256 => LotItem[]) internal lotItems;

    // ─────────────────────────────────── Lots ───────────────────────────────────

    /// @inheritdoc IPunksAuction
    function createLot(
        LotItem[] calldata items,
        uint96 reserveWei,
        address onlySellTo
    ) external returns (uint256 id) {
        return _createLot(items, reserveWei, onlySellTo);
    }

    /// @inheritdoc IPunksAuction
    function updateLot(uint256 id, uint96 reserveWei, address onlySellTo) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();
        if (reserveWei == 0) revert InvalidAmount();

        lot.reserveWei = reserveWei;
        lot.onlySellTo = onlySellTo;

        emit LotUpdated(id, reserveWei, onlySellTo);
    }

    /// @inheritdoc IPunksAuction
    function cancelLot(uint256 id) external {
        Lot storage lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();
        if (lot.seller != msg.sender) revert NotSeller();

        _releaseLotSlots(lot.seller, lotItems[id]);
        delete lots[id];
        delete lotItems[id];

        emit LotCancelled(id);
    }

    /// @inheritdoc IPunksAuction
    function clearStaleLot(uint256 id) external {
        _clearStaleLot(id);
    }

    /// @inheritdoc IPunksAuction
    function clearStaleLots(uint256[] calldata ids) external {
        uint256 len = ids.length;
        for (uint256 i; i < len;) {
            _clearStaleLot(ids[i]);
            unchecked {
                ++i;
            }
        }
    }

    // ─────────────────────────────────── Views ──────────────────────────────────

    /// @inheritdoc IPunksAuction
    function getLotItems(uint256 lotId) external view returns (LotItem[] memory) {
        return lotItems[lotId];
    }

    /// @notice Returns the active lot id holding a seller's Punk, or 0 if none.
    function activeLotFor(address seller, TokenStandard standard, uint16 punkId)
        external
        view
        returns (uint256)
    {
        return lotForPunk[_tokenKey(seller, _tokenContractFor(standard), punkId)];
    }

    // ───────────────────────────────── Internals ─────────────────────────────────

    /// @dev Creates a lot of `items` owned by `msg.sender`. Pre-checks that the
    ///      seller's vault is deployed and has approved this auction as
    ///      operator, surfacing misconfiguration up front.
    function _createLot(
        LotItem[] calldata items,
        uint96 reserveWei,
        address onlySellTo
    ) internal returns (uint256 id) {
        if (reserveWei == 0) revert InvalidAmount();
        _requireAuctionApproved(msg.sender);
        _validateLotItems(items);

        uint8 itemCount = uint8(items.length);

        unchecked {
            id = ++lastLotId;
        }

        lots[id] = Lot({
            seller: msg.sender,
            reserveWei: reserveWei,
            onlySellTo: onlySellTo
        });

        emit LotCreated(
            id,
            msg.sender,
            keccak256(abi.encode(items)),
            itemCount,
            reserveWei,
            onlySellTo
        );

        LotItem[] storage storedItems = lotItems[id];
        for (uint256 i; i < itemCount;) {
            LotItem calldata item = items[i];
            storedItems.push(item);
            bytes32 key = _tokenKey(msg.sender, _tokenContractFor(item.standard), item.punkId);
            lotForPunk[key] = id;
            emit LotItemDetail(id, uint8(i), item.standard, item.punkId, item.weightBps);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Removes a lot that is no longer approved or whose custody slipped
    ///      out of the vault.
    function _clearStaleLot(uint256 id) internal {
        Lot memory lot = lots[id];
        if (lot.seller == address(0)) revert LotNotFound();

        LotItem[] memory items = lotItems[id];
        bool stale = !_auctionIsApproved(lot.seller);
        if (!stale) {
            uint256 itemCount = items.length;
            for (uint256 i; i < itemCount;) {
                if (!_punkInSellerVault(items[i].standard, lot.seller, items[i].punkId)) {
                    stale = true;
                    break;
                }
                unchecked {
                    ++i;
                }
            }
        }
        if (!stale) revert LotNotStale();

        _releaseLotSlots(lot.seller, items);
        delete lots[id];
        delete lotItems[id];

        emit LotCleared(id, msg.sender);
    }

    /// @dev Validates lot items at create time: count, weights, duplicates,
    ///      vault custody, and per-item slot availability (one lot per Punk).
    function _validateLotItems(LotItem[] calldata items) internal view {
        uint256 n = items.length;
        if (n == 0 || n > MAX_LOT_ITEMS) revert InvalidItemCount();

        uint256 weightSum;
        for (uint256 i; i < n;) {
            uint16 w = items[i].weightBps;
            if (w == 0) revert InvalidWeights();
            weightSum += w;
            unchecked {
                ++i;
            }
        }
        if (weightSum != TOTAL_WEIGHT_BPS) revert InvalidWeights();

        for (uint256 i; i < n;) {
            for (uint256 j = i + 1; j < n;) {
                if (
                    items[i].standard == items[j].standard
                        && items[i].punkId == items[j].punkId
                ) {
                    revert DuplicateLotItem();
                }
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }

        for (uint256 i; i < n;) {
            LotItem calldata item = items[i];
            bytes32 key = _tokenKey(msg.sender, _tokenContractFor(item.standard), item.punkId);
            uint256 existingLot = lotForPunk[key];
            if (existingLot != 0) revert PunkAlreadyInLot(existingLot);
            _requirePunkInVault(item.standard, msg.sender, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Checks vault custody at open/accept/start time. The lot's existence
    ///      already implies its slot reservations are intact (first-wins).
    function _requireLotItemsValidForOpeningAuction(address seller, LotItem[] memory items) internal view {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            _requirePunkInVault(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Frees the per-Punk lot slots held by an items array, so the seller
    ///      can list those Punks again. Safe to call regardless of current
    ///      slot value: with first-wins, `lotForPunk[key]` for these items is
    ///      always either 0 or the lot being released.
    function _releaseLotSlots(address seller, LotItem[] memory items) internal {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            delete lotForPunk[_tokenKey(seller, _tokenContractFor(item.standard), item.punkId)];
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Releases per-Punk lot reservations and pulls each Punk from the
    ///      seller's vault into custody.
    function _pullLotItems(address seller, LotItem[] memory items) internal {
        uint256 n = items.length;
        for (uint256 i; i < n;) {
            LotItem memory item = items[i];
            delete lotForPunk[_tokenKey(seller, _tokenContractFor(item.standard), item.punkId)];
            _pullPunk(item.standard, seller, item.punkId);
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Builds the key that identifies a seller's holding of one Punk
    ///      across the `lotForPunk` reservation mapping.
    function _tokenKey(
        address seller,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(seller, tokenContract, tokenId));
    }

    /// @dev Reverts when the seller's vault does not currently hold the Punk.
    function _requirePunkInVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view {
        if (!_punkInSellerVault(standard, seller, punkIndex)) revert PunkNotInVault();
    }

    // ─────────────────────────────────── Hooks ──────────────────────────────────

    function _requireAuctionApproved(address seller) internal view virtual;

    function _auctionIsApproved(address seller) internal view virtual returns (bool);

    function _punkInSellerVault(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal view virtual returns (bool);

    function _pullPunk(
        TokenStandard standard,
        address seller,
        uint256 punkIndex
    ) internal virtual;

    function _tokenContractFor(TokenStandard standard) internal view virtual returns (address);
}
