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

    /// @notice Returns the owner set for a Punk.
    mapping(uint256 => address) public punkIndexToAddress;
    /// @notice Returns sale details set for a Punk.
    mapping(uint256 => Offer) public punksOfferedForSale;
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

    /// @notice Sets whether mock Punk purchases should fail.
    function setBreakBuyPunk(bool v) external {
        breakBuyPunk = v;
    }

    /// @notice Sets the starting owner for a Punk.
    function setInitialOwner(address to, uint256 punkIndex) external {
        punkIndexToAddress[punkIndex] = to;
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
