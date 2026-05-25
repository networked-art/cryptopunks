import { network } from 'hardhat'
import { getAddress, isAddress, parseAbi, type Address, type Hex } from 'viem'
import { normalize } from 'viem/ens'

const CRYPTOPUNKS_V1 = getAddress(
  '0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D',
)
const CRYPTOPUNKS_V2 = getAddress(
  '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
)
const PUNKS_V1_WRAPPER = getAddress(
  '0x282BDD42f4eb70e7A9D9F40c8fEA0825B7f68C5D',
)

// Mainnet ENS universal resolver, deployed well before the fork block. Passed
// explicitly so we don't need viem's `chain.contracts` config.
const ENS_UNIVERSAL_RESOLVER = getAddress(
  '0xce01f8eee7E479C928F8919abD53E553a36CeF67',
)

// jalil.eth — used both as the default recipient and as the fallback if ENS
// resolution returns nothing (shouldn't happen on a healthy mainnet fork).
const DEFAULT_RECIPIENT_NAME = 'jalil.eth'
const DEFAULT_RECIPIENT_ADDRESS = getAddress(
  '0xe11Da9560b51f8918295edC5ab9c0a90E9ADa20B',
)

const SOURCE_A = getAddress('0xaf7cf5910510b7cf912c156f91244487632e5fb6')
const A_V1_UNWRAPPED: readonly bigint[] = [6225n]
const A_V1_WRAPPED: readonly bigint[] = [
  1139n, 1623n, 1714n, 1806n, 2816n, 3360n, 4724n, 4736n, 5449n, 5728n,
  6120n, 8753n, 9109n,
]

const SOURCE_B = getAddress('0xc6400A5584db71e41B0E5dFbdC769b54B91256CD')
const B_V2_NATIVE: readonly bigint[] = [1325n, 4093n, 4372n, 5177n, 6529n, 9082n]

const PUNK_NATIVE_ABI = parseAbi([
  'function transferPunk(address to, uint256 punkIndex)',
  'function punkIndexToAddress(uint256) view returns (address)',
])

const ERC721_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])

const ONE_ETH_HEX = '0xDE0B6B3A7640000'

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

async function resolveRecipient(
  publicClient: Awaited<
    ReturnType<Awaited<ReturnType<typeof network.create>>['viem']['getPublicClient']>
  >,
  raw: string,
): Promise<{ address: Address; label: string }> {
  if (isAddress(raw)) {
    return { address: getAddress(raw), label: getAddress(raw) }
  }
  const name = normalize(raw)
  const address = await publicClient.getEnsAddress({
    name,
    universalResolverAddress: ENS_UNIVERSAL_RESOLVER,
  })
  if (!address) {
    if (raw === DEFAULT_RECIPIENT_NAME) return {
      address: DEFAULT_RECIPIENT_ADDRESS,
      label: `${DEFAULT_RECIPIENT_NAME} (${DEFAULT_RECIPIENT_ADDRESS}, hardcoded fallback)`,
    }
    throw new Error(`SEED_RECIPIENT "${raw}" did not resolve to an address.`)
  }
  return { address, label: `${name} (${address})` }
}

async function main() {
  const { viem } = await network.create()
  const publicClient = await viem.getPublicClient()

  const block = await publicClient.getBlockNumber()
  console.log(`Connected at block ${block}`)

  const recipientInput = process.env.SEED_RECIPIENT ?? DEFAULT_RECIPIENT_NAME
  const { address: recipient, label: recipientLabel } = await resolveRecipient(
    publicClient,
    recipientInput,
  )
  console.log(`Recipient: ${recipientLabel}`)

  // viem's typed `request` rejects hardhat_* methods; route through `any`.
  const rpc = <T = unknown>(method: string, params: unknown[]): Promise<T> =>
    (publicClient.request as (args: {
      method: string
      params: unknown[]
    }) => Promise<T>)({ method, params })

  const impersonate = async (addr: Address) => {
    await rpc('hardhat_impersonateAccount', [addr])
    await rpc('hardhat_setBalance', [addr, ONE_ETH_HEX])
  }
  const stop = (addr: Address) =>
    rpc('hardhat_stopImpersonatingAccount', [addr])

  const checkOwner = async (
    label: string,
    contract: Address,
    abi: typeof PUNK_NATIVE_ABI | typeof ERC721_ABI,
    fn: 'punkIndexToAddress' | 'ownerOf',
    id: bigint,
    expected: Address,
  ): Promise<'recipient' | 'expected' | 'other'> => {
    const owner = (await publicClient.readContract({
      address: contract,
      abi: abi as typeof PUNK_NATIVE_ABI,
      functionName: fn as 'punkIndexToAddress',
      args: [id],
    })) as Address
    if (eq(owner, recipient)) {
      console.log(`  ${label} #${id}: already recipient — skip`)
      return 'recipient'
    }
    if (!eq(owner, expected)) {
      console.warn(
        `  ${label} #${id}: unexpected owner ${owner} (want ${expected}) — skip`,
      )
      return 'other'
    }
    return 'expected'
  }

  const sendAndLog = async (
    label: string,
    from: Address,
    id: bigint,
    write: () => Promise<Hex>,
  ) => {
    const hash = await write()
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${label} #${id} ${from} → recipient  ${hash}`)
  }

  console.log(`\n${SOURCE_A} → ${recipient}`)
  await impersonate(SOURCE_A)
  const walletA = await viem.getWalletClient(SOURCE_A)
  for (const id of A_V1_UNWRAPPED) {
    const status = await checkOwner(
      'V1 native',
      CRYPTOPUNKS_V1,
      PUNK_NATIVE_ABI,
      'punkIndexToAddress',
      id,
      SOURCE_A,
    )
    if (status !== 'expected') continue
    await sendAndLog('V1 native', SOURCE_A, id, () =>
      walletA.writeContract({
        address: CRYPTOPUNKS_V1,
        abi: PUNK_NATIVE_ABI,
        functionName: 'transferPunk',
        args: [recipient, id],
      }) as Promise<Hex>,
    )
  }
  for (const id of A_V1_WRAPPED) {
    const status = await checkOwner(
      'V1 wrapped',
      PUNKS_V1_WRAPPER,
      ERC721_ABI,
      'ownerOf',
      id,
      SOURCE_A,
    )
    if (status !== 'expected') continue
    await sendAndLog('V1 wrapped', SOURCE_A, id, () =>
      walletA.writeContract({
        address: PUNKS_V1_WRAPPER,
        abi: ERC721_ABI,
        functionName: 'transferFrom',
        args: [SOURCE_A, recipient, id],
      }) as Promise<Hex>,
    )
  }
  await stop(SOURCE_A)

  console.log(`\n${SOURCE_B} → ${JALIL}`)
  await impersonate(SOURCE_B)
  const walletB = await viem.getWalletClient(SOURCE_B)
  for (const id of B_V2_NATIVE) {
    const status = await checkOwner(
      'V2 native',
      CRYPTOPUNKS_V2,
      PUNK_NATIVE_ABI,
      'punkIndexToAddress',
      id,
      SOURCE_B,
    )
    if (status !== 'expected') continue
    await sendAndLog('V2 native', SOURCE_B, id, () =>
      walletB.writeContract({
        address: CRYPTOPUNKS_V2,
        abi: PUNK_NATIVE_ABI,
        functionName: 'transferPunk',
        args: [JALIL, id],
      }) as Promise<Hex>,
    )
  }
  await stop(SOURCE_B)

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
