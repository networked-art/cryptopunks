// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ZlibSymbols} from "../../contracts/lib/ZlibSymbols.sol";

contract ZlibSymbolsTest {
    function test_lengthSymbol_mapsBaseCodes() public pure {
        assertLength(3, 257, 0, 0);
        assertLength(10, 264, 0, 0);
        assertLength(11, 265, 1, 0);
        assertLength(12, 265, 1, 1);
        assertLength(258, 285, 0, 0);
    }

    function test_lengthSymbol_rejectsInvalidLengths() public view {
        try this.lengthSymbol(2) {
            revert("accepted short length");
        } catch (bytes memory) {}

        try this.lengthSymbol(259) {
            revert("accepted long length");
        } catch (bytes memory) {}
    }

    function test_distanceSymbol_mapsBaseCodes() public pure {
        assertDistance(1, 0, 0, 0);
        assertDistance(4, 3, 0, 0);
        assertDistance(5, 4, 1, 0);
        assertDistance(6, 4, 1, 1);
        assertDistance(24_577, 29, 13, 0);
        assertDistance(32_768, 29, 13, 8_191);
    }

    function test_distanceSymbol_rejectsInvalidDistances() public view {
        try this.distanceSymbol(0) {
            revert("accepted zero distance");
        } catch (bytes memory) {}

        try this.distanceSymbol(32_769) {
            revert("accepted far distance");
        } catch (bytes memory) {}
    }

    function lengthSymbol(uint16 length)
        external
        pure
        returns (ZlibSymbols.Symbol memory)
    {
        return ZlibSymbols.lengthSymbol(length);
    }

    function distanceSymbol(uint16 distance)
        external
        pure
        returns (ZlibSymbols.Symbol memory)
    {
        return ZlibSymbols.distanceSymbol(distance);
    }

    function assertLength(
        uint16 length,
        uint16 expectedSymbol,
        uint8 expectedExtraBits,
        uint16 expectedExtraValue
    ) private pure {
        ZlibSymbols.Symbol memory code = ZlibSymbols.lengthSymbol(length);
        require(code.symbol == expectedSymbol, "length symbol");
        require(code.extraBits == expectedExtraBits, "length extra bits");
        require(code.extraValue == expectedExtraValue, "length extra value");
    }

    function assertDistance(
        uint16 distance,
        uint16 expectedSymbol,
        uint8 expectedExtraBits,
        uint16 expectedExtraValue
    ) private pure {
        ZlibSymbols.Symbol memory code = ZlibSymbols.distanceSymbol(distance);
        require(code.symbol == expectedSymbol, "distance symbol");
        require(code.extraBits == expectedExtraBits, "distance extra bits");
        require(code.extraValue == expectedExtraValue, "distance extra value");
    }
}
