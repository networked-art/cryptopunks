import type { Address } from 'viem'

/**
 * Ç̭̮̾r͚y̜ͥ͌́ͥp̈t̟ͪ͐̚o̘P̸̌̀ụ͖̲̐͡n̬̱̻̗̆̕ͅk̡̯̤̰̭̎ͭs̸̢̼̋͟ V1 wrapper (ERC-721). When a Punk is wrapped the raw V1
 * market reports this contract as the owner; the canonical holder is the
 * ERC-721 token owner read from this contract's `ownerOf`.
 */
export const V1_WRAPPER_ADDRESS =
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D' as Address

/**
 * Mainnet `PunksMarket.sol` — the wrapping market + collection bid book.
 * Immutable, deployed once; not configurable at runtime.
 */
export const PUNKS_MARKET_ADDRESS =
  '0x64e507FEBF26521b73FbdfA533106B2042533218' as Address
