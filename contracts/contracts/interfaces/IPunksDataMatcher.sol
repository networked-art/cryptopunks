// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./IPunksData.sol";

/// @title  IPunksDataMatcher
/// @notice Read-only Punk data surface needed to evaluate a `Punks.Filter`
///         against a Punk.
/// @dev    Bundles `IPunksDataCriteria` (trait reads) and `IPunksDataVisual`
///         (color and visual-metric reads). Excludes the loader (admin
///         writes) and the indexed pixel reads used by renderers.
interface IPunksDataMatcher is IPunksDataCriteria, IPunksDataVisual {}
