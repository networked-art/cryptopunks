import { addressLabel } from '@networked-art/punks-sdk'
import type { Address } from 'viem'
import { shortenAddress } from './format'
import type { PunksIndexer } from './indexer'

/// Resolves an address to the friendliest available name. An ENS name (from the
/// indexer's profiles API) wins when present, rendered as `name (0x1234…abcd)`;
/// otherwise a curated SDK label (museums, NODE, Yuga…); otherwise just the
/// shortened address. Results are memoized for the process lifetime — the same
/// buyer often shows up across a batch.
export class NameResolver {
  private readonly cache = new Map<string, string>()

  constructor(private readonly indexer: PunksIndexer) {}

  async resolve(address: Address): Promise<string> {
    const key = address.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached

    const ens = await this.indexer.ensName(address)
    const name = ens
      ? `${ens} (${shortenAddress(address)})`
      : (addressLabel(address)?.name ?? shortenAddress(address))

    this.cache.set(key, name)
    return name
  }
}
