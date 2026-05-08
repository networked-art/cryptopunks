// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Faithful mock of the original CryptoPunks V1 buyPunk accounting bug.
contract MockCryptoPunksMarketV1Buggy {
    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    /// @notice Returns the owner set for a Punk.
    mapping(uint256 => address) public punkIndexToAddress;
    /// @notice Returns the mocked Punk balance for an address.
    mapping(address => uint256) public balanceOf;
    /// @notice Returns sale details set for a Punk.
    mapping(uint256 => Offer) public punksOfferedForSale;
    /// @notice Returns ETH that an address can withdraw.
    mapping(address => uint256) public pendingWithdrawals;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex);
    event PunkOffered(uint256 indexed punkIndex, uint256 minValue, address indexed toAddress);
    event PunkBought(
        uint256 indexed punkIndex,
        uint256 value,
        address indexed fromAddress,
        address indexed toAddress
    );
    event PunkNoLongerForSale(uint256 indexed punkIndex);

    /// @notice Sets the starting owner for a Punk.
    function setInitialOwner(address to, uint256 punkIndex) external {
        punkIndexToAddress[punkIndex] = to;
        balanceOf[to] += 1;
    }

    /// @notice Offers a Punk for sale to anyone.
    /// @dev Mirrors the public sale helper exposed by the original V1 market.
    function offerPunkForSale(uint256 punkIndex, uint256 minSalePriceInWei) public {
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
    /// @dev Stores a directed sale offer without changing ownership.
    function offerPunkForSaleToAddress(
        uint256 punkIndex,
        uint256 minSalePriceInWei,
        address toAddress
    ) public {
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
    /// @dev Keeps the V1 behavior of writing an inactive offer record.
    function punkNoLongerForSale(uint256 punkIndex) public {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punksOfferedForSale[punkIndex] = Offer({
            isForSale: false,
            punkIndex: punkIndex,
            seller: msg.sender,
            minValue: 0,
            onlySellTo: address(0)
        });
        emit PunkNoLongerForSale(punkIndex);
    }

    /// @notice Buys a Punk that is offered for sale.
    function buyPunk(uint256 punkIndex) external payable {
        Offer storage offer = punksOfferedForSale[punkIndex];
        require(offer.isForSale, "not for sale");
        require(offer.onlySellTo == address(0) || offer.onlySellTo == msg.sender, "not allowed");
        require(msg.value >= offer.minValue, "insufficient value");
        require(offer.seller == punkIndexToAddress[punkIndex], "seller != owner");

        address trueSeller = offer.seller;
        punkIndexToAddress[punkIndex] = msg.sender;
        balanceOf[trueSeller] -= 1;
        balanceOf[msg.sender] += 1;
        emit Transfer(trueSeller, msg.sender, 1);

        punkNoLongerForSale(punkIndex);

        pendingWithdrawals[offer.seller] += msg.value;
        emit PunkBought(punkIndex, msg.value, offer.seller, msg.sender);
    }

    /// @notice Transfers a Punk to another address.
    function transferPunk(address to, uint256 punkIndex) external {
        require(punkIndexToAddress[punkIndex] == msg.sender, "not owner");
        punkIndexToAddress[punkIndex] = to;
        balanceOf[msg.sender] -= 1;
        balanceOf[to] += 1;
        emit Transfer(msg.sender, to, 1);
        emit PunkTransfer(msg.sender, to, punkIndex);
    }

    /// @notice Withdraws pending ETH from the mock market.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
