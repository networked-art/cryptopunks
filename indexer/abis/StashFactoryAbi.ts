import { parseAbi } from 'viem'

// StashFactory (Yuga Labs) — `Deployed(proxy, implementation)` is inherited
// from ERC1967Factory and fires once per Stash deployed by `deployStash`.
// The event doesn't carry the owner, so handlers must `eth_call` the proxy's
// `owner()` to resolve which EOA the Stash belongs to.
export const StashFactoryAbi = parseAbi([
  'event Deployed(address indexed proxy, address indexed implementation)',
])

// Minimal slice of the Stash proxy used to resolve `owner()` from the
// `Deployed` event handler.
export const StashProxyAbi = parseAbi([
  'function owner() view returns (address)',
])
