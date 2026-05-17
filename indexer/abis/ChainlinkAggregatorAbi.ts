import { parseAbi } from 'viem'

// Chainlink AggregatorV3 — the underlying OCR aggregator behind the ETH/USD
// price feed proxy. We *query* this contract from API-context code (not
// indexed via Ponder), so we expose the round-read functions in addition to
// the event signature. `latestRoundData` / `getRoundData` return:
//   (roundId, answer, startedAt, updatedAt, answeredInRound)
// where `answer` is the price scaled by 1e8 (Chainlink standard for USD).
export const ChainlinkAggregatorAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestAnswer() view returns (int256)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)',
])
