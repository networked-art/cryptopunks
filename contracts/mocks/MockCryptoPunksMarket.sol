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

    mapping(uint256 => address) public punkIndexToAddress;
    mapping(uint256 => Offer) public punksOfferedForSale;
    mapping(address => uint256) public pendingWithdrawals;

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

    function setBreakBuyPunk(bool v) external {
        breakBuyPunk = v;
    }

    function setInitialOwner(address to, uint256 punkIndex) external {
        punkIndexToAddress[punkIndex] = to;
    }

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

    function punkNoLongerForSale(uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        delete punksOfferedForSale[punkIndex];
        emit PunkNoLongerForSale(punkIndex);
    }

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

    function transferPunk(address to, uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punkIndexToAddress[punkIndex] = to;
        delete punksOfferedForSale[punkIndex];
        emit PunkTransfer(msg.sender, to, punkIndex);
    }

    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        if (amount > 0) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            require(ok, "withdraw failed");
        }
    }
}
