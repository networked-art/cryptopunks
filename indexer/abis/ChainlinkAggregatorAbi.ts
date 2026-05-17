import { parseAbi } from 'viem'

// Chainlink AggregatorV3 — the underlying OCR aggregator behind the
// ETH/USD price feed proxy. `AnswerUpdated.current` is the price scaled by
// 1e8 (Chainlink standard for USD pairs). The proxy itself does not emit
// `AnswerUpdated`, so we listen on the aggregator directly.
export const ChainlinkAggregatorAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestAnswer() view returns (int256)',
  'event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)',
])
