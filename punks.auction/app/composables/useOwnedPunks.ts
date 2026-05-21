import type { Address } from 'viem'
import { parseAbiItem } from 'viem'
import { cryptoPunksMarketAbi } from '@networked-art/punks-sdk'
import { CRYPTOPUNKS_ADDRESS } from '~/utils/addresses'

/// Canonical `CryptoPunks` events that move a Punk into an address.
const ASSIGN = parseAbiItem(
  'event Assign(address indexed to, uint256 punkIndex)',
)
const PUNK_TRANSFER = parseAbiItem(
  'event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex)',
)
const PUNK_BOUGHT = parseAbiItem(
  'event PunkBought(uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)',
)

/**
 * Canonical Punks currently held by `address`.
 *
 * With no indexer, ownership is reconstructed on-chain: scan every event that
 * ever moved a Punk *into* the address, then verify which ones it still holds
 * via `punkIndexToAddress`. The verification step means stale "received" logs
 * never produce false positives.
 */
export function useOwnedPunks(address: MaybeRefOrGetter<Address | undefined>) {
  const client = useReadClient()

  const ids = ref<number[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const addr = toValue(address)
    const c = client.value
    if (!addr || !c) {
      ids.value = []
      return
    }

    loading.value = true
    error.value = null
    try {
      const [assigns, transfers, boughts] = await Promise.all([
        c.getLogs({
          address: CRYPTOPUNKS_ADDRESS,
          event: ASSIGN,
          args: { to: addr },
          fromBlock: 'earliest',
          toBlock: 'latest',
        }),
        c.getLogs({
          address: CRYPTOPUNKS_ADDRESS,
          event: PUNK_TRANSFER,
          args: { to: addr },
          fromBlock: 'earliest',
          toBlock: 'latest',
        }),
        c.getLogs({
          address: CRYPTOPUNKS_ADDRESS,
          event: PUNK_BOUGHT,
          args: { toAddress: addr },
          fromBlock: 'earliest',
          toBlock: 'latest',
        }),
      ])

      const candidates = new Set<number>()
      for (const log of assigns) candidates.add(Number(log.args.punkIndex))
      for (const log of transfers) candidates.add(Number(log.args.punkIndex))
      for (const log of boughts) candidates.add(Number(log.args.punkIndex))

      const candidateIds = [...candidates]
      if (!candidateIds.length) {
        ids.value = []
        return
      }

      const owners = await c.multicall({
        contracts: candidateIds.map((id) => ({
          address: CRYPTOPUNKS_ADDRESS,
          abi: cryptoPunksMarketAbi,
          functionName: 'punkIndexToAddress' as const,
          args: [BigInt(id)] as const,
        })),
      })

      const lower = addr.toLowerCase()
      ids.value = candidateIds
        .filter(
          (_id, i) =>
            owners[i]?.status === 'success' &&
            (owners[i]!.result as Address).toLowerCase() === lower,
        )
        .sort((a, b) => a - b)
    } catch (e) {
      error.value = (e as Error).message
      ids.value = []
    } finally {
      loading.value = false
    }
  }

  watch([() => toValue(address), client], () => void load(), {
    immediate: true,
  })

  return { ids, loading, error, refresh: load }
}
