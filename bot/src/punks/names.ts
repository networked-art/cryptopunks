import { addressLabel } from '@networked-art/punks-sdk'
import { createPublicClient, http, type Address, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { shortenAddress } from './format'

/// Resolves an address to the friendliest available name, in order: a curated
/// label from the SDK (museums, NODE, Yuga…), then an ENS name if an RPC is
/// configured, then a shortened `0x1234…abcd`. Results are memoized for the
/// process lifetime — the same buyer often shows up across a batch.
export class NameResolver {
  private readonly ens: PublicClient | null
  private readonly cache = new Map<string, string>()

  constructor(rpcUrl?: string) {
    this.ens = rpcUrl
      ? createPublicClient({ chain: mainnet, transport: http(rpcUrl) })
      : null
  }

  async resolve(address: Address): Promise<string> {
    const key = address.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached

    const name =
      addressLabel(address)?.name ??
      (await this.ensName(address)) ??
      shortenAddress(address)

    this.cache.set(key, name)
    return name
  }

  private async ensName(address: Address): Promise<string | null> {
    if (!this.ens) return null
    try {
      return await this.ens.getEnsName({ address })
    } catch {
      return null
    }
  }
}
