// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Mock of the CryptoPunksMarket subset used by the auction house.
contract MockCryptoPunksMarket {
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    struct Bid {
        bool hasBid;
        uint256 punkIndex;
        address bidder;
        uint256 value;
    }

    /// @notice Returns the owner set for a Punk.
    mapping(uint256 => address) public punkIndexToAddress;
    /// @notice Returns sale details set for a Punk.
    mapping(uint256 => Offer) public punksOfferedForSale;
    /// @notice Returns bid details set for a Punk.
    mapping(uint256 => Bid) public punkBids;
    /// @notice Returns ETH that an address can withdraw.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Returns whether mock Punk purchases should fail.
    bool public breakBuyPunk;

    event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex);
    event PunkOffered(uint256 indexed punkIndex, uint256 minValue, address indexed toAddress);
    event PunkBought(
        uint256 indexed punkIndex,
        uint256 value,
        address indexed fromAddress,
        address indexed toAddress
    );
    event PunkNoLongerForSale(uint256 indexed punkIndex);
    event PunkBidEntered(uint256 indexed punkIndex, uint256 value, address indexed fromAddress);
    event PunkBidWithdrawn(uint256 indexed punkIndex, uint256 value, address indexed fromAddress);

    /// @notice Sets whether mock Punk purchases should fail.
    function setBreakBuyPunk(bool v) external {
        breakBuyPunk = v;
    }

    /// @notice Sets the starting owner for a Punk.
    function setInitialOwner(address to, uint256 punkIndex) external {
        punkIndexToAddress[punkIndex] = to;
    }

    /// @notice Offers a Punk for sale to anyone.
    function offerPunkForSale(uint256 punkIndex, uint256 minSalePriceInWei) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: true,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: minSalePriceInWei,
            onlySellTo: address(0)
        });
        emit PunkOffered(punkIndex, minSalePriceInWei, address(0));
    }

    /// @notice Offers a Punk for sale to one address.
    function offerPunkForSaleToAddress(
        uint256 punkIndex,
        uint256 minSalePriceInWei,
        address toAddress
    ) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: true,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: minSalePriceInWei,
            onlySellTo: toAddress
        });
        emit PunkOffered(punkIndex, minSalePriceInWei, toAddress);
    }

    /// @notice Removes a Punk sale offer.
    function punkNoLongerForSale(uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        delete punksOfferedForSale[punkIndex];
        emit PunkNoLongerForSale(punkIndex);
    }

    /// @notice Buys a Punk that is offered for sale.
    function buyPunk(uint256 punkIndex) external payable {
        require(!breakBuyPunk, "buy broken");
        Offer memory offer = punksOfferedForSale[punkIndex];
        require(offer.isForSale, "not for sale");
        require(offer.onlySellTo == address(0) || offer.onlySellTo == msg.sender, "not allowed");
        require(msg.value >= offer.minValue, "insufficient value");
        require(offer.seller == punkIndexToAddress[punkIndex], "seller != owner");

        address seller = offer.seller;
        punkIndexToAddress[punkIndex] = msg.sender;
        delete punksOfferedForSale[punkIndex];
        pendingWithdrawals[seller] += msg.value;

        emit PunkTransfer(seller, msg.sender, punkIndex);
        emit PunkBought(punkIndex, msg.value, seller, msg.sender);
    }

    /// @notice Transfers a Punk to another address.
    function transferPunk(address to, uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punkIndexToAddress[punkIndex] = to;
        delete punksOfferedForSale[punkIndex];
        emit PunkTransfer(msg.sender, to, punkIndex);
    }

    /// @notice Places a bid on a Punk, refunding any previous bidder through pending withdrawals.
    function enterBidForPunk(uint256 punkIndex) external payable {
        require(punkIndexToAddress[punkIndex] != address(0), "punk not assigned");
        require(punkIndexToAddress[punkIndex] != msg.sender, "owner bid");
        require(msg.value > 0, "zero bid");

        Bid memory existing = punkBids[punkIndex];
        require(msg.value > existing.value, "bid too low");
        if (existing.hasBid) {
            pendingWithdrawals[existing.bidder] += existing.value;
        }

        punkBids[punkIndex] = Bid({
            hasBid: true,
            punkIndex: punkIndex,
            bidder: msg.sender,
            value: msg.value
        });
        emit PunkBidEntered(punkIndex, msg.value, msg.sender);
    }

    /// @notice Withdraws the caller's standing bid on a Punk.
    function withdrawBidForPunk(uint256 punkIndex) external {
        Bid memory bid = punkBids[punkIndex];
        require(bid.hasBid, "no bid");
        require(bid.bidder == msg.sender, "not bidder");

        delete punkBids[punkIndex];
        (bool ok,) = payable(msg.sender).call{value: bid.value}("");
        require(ok, "bid withdraw failed");
        emit PunkBidWithdrawn(punkIndex, bid.value, msg.sender);
    }

    /// @notice Accepts the standing bid for a Punk at >= minPrice.
    function acceptBidForPunk(uint256 punkIndex, uint256 minPrice) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        Bid memory bid = punkBids[punkIndex];
        require(bid.hasBid, "no bid");
        require(bid.value >= minPrice, "bid below min");

        delete punkBids[punkIndex];
        delete punksOfferedForSale[punkIndex];
        punkIndexToAddress[punkIndex] = bid.bidder;
        pendingWithdrawals[msg.sender] += bid.value;

        emit PunkTransfer(msg.sender, bid.bidder, punkIndex);
        emit PunkBought(punkIndex, bid.value, msg.sender, bid.bidder);
    }

    /// @notice Withdraws pending ETH from the mock market.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        if (amount > 0) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            require(ok, "withdraw failed");
        }
    }
}
