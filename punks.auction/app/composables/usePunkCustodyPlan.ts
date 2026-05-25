import {
  CRYPTOPUNKS_721_ADDRESS,
  PUNKS_V1_WRAPPER_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  punkVaultAbi,
  type ContractWritePlan,
  type LotItemInput,
  type PunkStandardRef,
} from '@networked-art/punks-sdk'
import type { Address } from 'viem'
import { PUNKS_AUCTION_ADDRESS } from '~/utils/addresses'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'
import type { AccountPunkInventoryItem } from '~/composables/useAccountPunkInventory'

export type CustodyPlanningItem = Pick<
  AccountPunkInventoryItem,
  'punkId' | 'standard' | 'custody' | 'wrapper'
>

export function usePunkCustodyPlan() {
  const { sdk } = usePunksSdk()
  const publicClient = useReadClient()

  async function activeLotIdFor(
    seller: Address,
    item: Pick<CustodyPlanningItem, 'standard' | 'punkId'>,
  ) {
    return sdk.value.auctions.activeLotFor({
      seller,
      standard: standardRef(item.standard),
      punkId: item.punkId,
    })
  }

  async function buildCustodyPlans(input: {
    owner: Address
    vault: Address | null
    vaultDeployed: boolean
    stash: Address | null
    items: readonly CustodyPlanningItem[]
  }): Promise<ContractWritePlan[]> {
    const activeLots = await Promise.all(
      input.items.map((item) => activeLotIdFor(input.owner, item)),
    )
    const blockedIndex = activeLots.findIndex((lotId) => lotId !== 0n)
    if (blockedIndex >= 0) {
      const blocked = input.items[blockedIndex]!
      throw new Error(
        `Punk #${blocked.punkId} is already reserved in lot #${activeLots[
          blockedIndex
        ]!.toString()}.`,
      )
    }

    const plans: ContractWritePlan[] = []
    if (await needsVaultSetup(input.owner, input.vault, input.vaultDeployed)) {
      plans.push(
        await sdk.value.auctions.prepareEnsureMyVault([PUNKS_AUCTION_ADDRESS]),
      )
    }

    plans.push(...buildWithdrawPlans(input.stash, input.items))
    plans.push(...buildUnwrapPlans(input.stash, input.items))

    for (const item of input.items) {
      if (item.custody === 'vault') continue
      plans.push(
        await sdk.value.auctions.prepareDeposit({
          owner: input.owner,
          punkId: item.punkId,
          standard: standardRef(item.standard),
        }),
      )
    }

    return plans
  }

  function lotItemsFor(
    items: readonly (Pick<CustodyPlanningItem, 'standard' | 'punkId'> & {
      weightBps: number
    })[],
  ): LotItemInput[] {
    return items.map((item) => ({
      punkId: item.punkId,
      standard: standardRef(item.standard),
      weightBps: item.weightBps,
    }))
  }

  async function needsVaultSetup(
    owner: Address,
    vault: Address | null,
    vaultDeployed: boolean,
  ) {
    if (!vault || !vaultDeployed) return true
    const client = publicClient.value
    if (!client) return true

    try {
      const [vaultOwner, approved] = await Promise.all([
        client.readContract({
          address: vault,
          abi: punkVaultAbi,
          functionName: 'owner',
        }) as Promise<Address>,
        client.readContract({
          address: vault,
          abi: punkVaultAbi,
          functionName: 'isOperator',
          args: [PUNKS_AUCTION_ADDRESS],
        }) as Promise<boolean>,
      ])
      if (!sameAddress(vaultOwner, owner)) {
        throw new Error('The predicted vault is not owned by this wallet.')
      }
      return !approved
    } catch (e) {
      if ((e as Error).message.includes('predicted vault')) throw e
      return true
    }
  }

  function buildWithdrawPlans(
    stash: Address | null,
    items: readonly CustodyPlanningItem[],
  ) {
    const plans: ContractWritePlan[] = []
    const nativeStashPunks = items.filter(
      (item) =>
        item.custody === 'stash' && item.standard === TokenStandard.CryptoPunks,
    )
    const unsupportedNativeStash = items.find(
      (item) =>
        item.custody === 'stash' &&
        item.standard === TokenStandard.CryptoPunksV1,
    )
    if (unsupportedNativeStash) {
      throw new Error(
        'V1 Punks held in Stash cannot be prepared automatically.',
      )
    }

    if (nativeStashPunks.length) {
      if (!stash) throw new Error('Stash address is still loading.')
      plans.push(
        sdk.value.stash
          .at(stash)
          .prepareWithdrawPunks(nativeStashPunks.map((item) => item.punkId)),
      )
    }

    const wrappedStash = items.filter(
      (item) => item.custody === 'wrapped-stash',
    )
    for (const [token, tokenIds] of wrappedTokenGroups(wrappedStash)) {
      if (!stash) throw new Error('Stash address is still loading.')
      plans.push(
        sdk.value.stash.at(stash).prepareWithdrawERC721({
          token,
          tokenIds,
        }),
      )
    }

    return plans
  }

  function buildUnwrapPlans(
    stash: Address | null,
    items: readonly CustodyPlanningItem[],
  ) {
    const plans: ContractWritePlan[] = []
    for (const item of items) {
      if (
        item.custody !== 'wrapped-wallet' &&
        item.custody !== 'wrapped-stash'
      ) {
        if (item.custody === 'unsupported') {
          throw new Error(`Punk #${item.punkId} is in unsupported custody.`)
        }
        continue
      }

      const plan = unwrapPlan(item)
      if (!plan) {
        const location =
          item.custody === 'wrapped-stash' && stash ? ' in Stash' : ''
        throw new Error(
          `Punk #${item.punkId}${location} uses an unsupported wrapper.`,
        )
      }
      plans.push(plan)
    }
    return plans
  }

  function unwrapPlan(item: CustodyPlanningItem) {
    if (
      item.standard === TokenStandard.CryptoPunksV1 ||
      item.wrapper === 'v1_wrapper'
    ) {
      return sdk.value.v1Wrapper.prepareUnwrap(item.punkId)
    }
    if (item.wrapper === 'cryptopunks_721') {
      return sdk.value.wrappers.c721.prepareUnwrapPunk(item.punkId)
    }
    if (item.wrapper === 'wrapped_punks') {
      return sdk.value.wrappers.legacy.prepareBurn(item.punkId)
    }
    return null
  }

  return {
    activeLotIdFor,
    buildCustodyPlans,
    lotItemsFor,
    standardRef,
  }
}

function wrappedTokenGroups(items: readonly CustodyPlanningItem[]) {
  const groups = new Map<Address, number[]>()
  for (const item of items) {
    const token = wrapperTokenAddress(item)
    if (!token) continue
    const ids = groups.get(token) ?? []
    ids.push(item.punkId)
    groups.set(token, ids)
  }
  return groups.entries()
}

function wrapperTokenAddress(item: CustodyPlanningItem): Address | null {
  if (
    item.standard === TokenStandard.CryptoPunksV1 ||
    item.wrapper === 'v1_wrapper'
  ) {
    return PUNKS_V1_WRAPPER_ADDRESS
  }
  if (item.wrapper === 'cryptopunks_721') return CRYPTOPUNKS_721_ADDRESS
  if (item.wrapper === 'wrapped_punks') return WRAPPED_PUNKS_ADDRESS
  return null
}

function standardRef(standard: TokenStandardValue): PunkStandardRef {
  return standard === TokenStandard.CryptoPunksV1
    ? 'cryptopunks-v1'
    : 'cryptopunks'
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
