import type { Address } from 'viem'
import { queryIndexer } from '~/utils/indexer'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const INVENTORY_PAGE_SIZE = 1000

const PUNKS_INVENTORY_QUERY = `
  query AccountPunkInventory($addrs: [String!]!, $limit: Int!, $after: String) {
    punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        punk_id
        owner
        native_owner
        native_standard
        is_wrapped
        wrapper
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const V1_PUNKS_INVENTORY_QUERY = `
  query AccountV1PunkInventory($addrs: [String!]!, $limit: Int!, $after: String) {
    v1Punks(
      where: { owner_in: $addrs }
      orderBy: "punk_id"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        punk_id
        owner
        native_owner
        is_wrapped
        wrapper
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

export type PunkInventoryWrapper =
  | 'wrapped_punks'
  | 'cryptopunks_721'
  | 'v1_wrapper'
  | string
  | null

export type PunkInventoryCustody =
  | 'vault'
  | 'wallet'
  | 'stash'
  | 'wrapped-wallet'
  | 'wrapped-stash'
  | 'unsupported'

export type AccountPunkInventoryItem = {
  key: string
  punkId: number
  standard: TokenStandardValue
  owner: Address
  nativeOwner: Address | null
  nativeStandard: string | null
  isWrapped: boolean
  wrapper: PunkInventoryWrapper
  custody: PunkInventoryCustody
}

type InventoryRow = {
  punk_id: string
  owner: Address | null
  native_owner?: Address | null
  native_standard?: string | null
  is_wrapped: boolean
  wrapper?: PunkInventoryWrapper
}

type PunkConnection = {
  items: InventoryRow[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

type InventoryQueryKey = 'punks' | 'v1Punks'
type InventoryQueryData = Partial<Record<InventoryQueryKey, PunkConnection>>

export function useAccountPunkInventory(
  account: MaybeRefOrGetter<Address | undefined>,
  options: { includeV1?: MaybeRefOrGetter<boolean> } = {},
) {
  const {
    vault,
    stash,
    wrapperProxy,
    vaultDeployed,
    stashDeployed,
    loading: addressesLoading,
    error: addressesError,
    refresh: refreshAddresses,
  } = useAccountAddresses(account)
  const renderV1 = useV1Rendering()
  // Fetch V1 Punks when the user opted into V1 rendering, or when a caller
  // explicitly needs them (lot creation offers to pair a Punk with its V1).
  const fetchV1 = computed(
    () => renderV1.value || toValue(options.includeV1) === true,
  )

  const items = ref<AccountPunkInventoryItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let token = 0

  async function load() {
    const t = ++token
    const acct = toValue(account)
    items.value = []
    if (!acct) {
      loading.value = false
      error.value = null
      return
    }

    const addrs = compactLowerAddresses([acct, vault.value, stash.value])
    // V1 Punks live only in the wallet or the Punks Vault — the Stash is a
    // CryptoPunks-only custody surface — so we never look up V1 ownership under
    // the Stash address. This keeps a V1-in-Stash state unrepresentable.
    const v1Addrs = compactLowerAddresses([acct, vault.value])
    loading.value = true
    error.value = null
    try {
      const [v2Rows, v1Rows] = await Promise.all([
        fetchInventoryRows(
          PUNKS_INVENTORY_QUERY,
          'punks',
          addrs,
          () => t === token,
        ),
        fetchV1.value
          ? fetchInventoryRows(
              V1_PUNKS_INVENTORY_QUERY,
              'v1Punks',
              v1Addrs,
              () => t === token,
            )
          : Promise.resolve([]),
      ])
      if (t !== token) return

      const context = {
        account: acct,
        vault: vault.value,
        stash: stash.value,
      }
      items.value = [
        ...v2Rows.map((row) =>
          inventoryItem(row, TokenStandard.CryptoPunks, context),
        ),
        ...v1Rows.map((row) =>
          inventoryItem(row, TokenStandard.CryptoPunksV1, context),
        ),
      ]
        .filter((item): item is AccountPunkInventoryItem => !!item)
        .sort((a, b) => a.standard - b.standard || a.punkId - b.punkId)
    } catch (e) {
      if (t !== token) return
      error.value = (e as Error).message
      items.value = []
    } finally {
      if (t === token) loading.value = false
    }
  }

  watch([() => toValue(account), vault, stash, fetchV1], () => void load(), {
    immediate: true,
  })

  return {
    items,
    vault,
    stash,
    wrapperProxy,
    vaultDeployed,
    stashDeployed,
    loading: computed(() => loading.value || addressesLoading.value),
    error: computed(() => error.value ?? addressesError.value),
    refresh: async () => {
      await refreshAddresses()
      await load()
    },
  }
}

async function fetchInventoryRows(
  query: string,
  key: InventoryQueryKey,
  addrs: string[],
  isCurrent: () => boolean,
): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = []
  let after: string | null = null

  while (isCurrent()) {
    const data: InventoryQueryData = await queryIndexer<InventoryQueryData>(
      query,
      {
        addrs,
        limit: INVENTORY_PAGE_SIZE,
        after,
      },
    )
    const page: PunkConnection | undefined = data[key]
    if (!page) throw new Error('Indexer returned no punk inventory page')
    rows.push(...page.items)

    if (!page.pageInfo.hasNextPage) break
    if (!page.pageInfo.endCursor) {
      throw new Error('Indexer pagination cursor missing')
    }
    after = page.pageInfo.endCursor
  }

  return rows
}

function inventoryItem(
  row: InventoryRow,
  standard: TokenStandardValue,
  context: {
    account: Address
    vault: Address | null
    stash: Address | null
  },
): AccountPunkInventoryItem | null {
  if (!row.owner) return null
  const punkId = Number(row.punk_id)
  if (!Number.isInteger(punkId)) return null

  const owner = row.owner
  return {
    key: `${standard}-${punkId}`,
    punkId,
    standard,
    owner,
    nativeOwner: row.native_owner ?? null,
    nativeStandard: row.native_standard ?? null,
    isWrapped: row.is_wrapped,
    wrapper: row.wrapper ?? null,
    custody: classifyCustody(row, context),
  }
}

function classifyCustody(
  row: InventoryRow,
  context: {
    account: Address
    vault: Address | null
    stash: Address | null
  },
): PunkInventoryCustody {
  if (!row.owner) return 'unsupported'

  const owner = row.owner.toLowerCase()
  const account = context.account.toLowerCase()
  const vault = context.vault?.toLowerCase() ?? null
  const stash = context.stash?.toLowerCase() ?? null

  if (vault && owner === vault) return 'vault'
  if (stash && owner === stash) {
    return row.is_wrapped ? 'wrapped-stash' : 'stash'
  }
  if (owner === account) {
    return row.is_wrapped ? 'wrapped-wallet' : 'wallet'
  }
  return 'unsupported'
}

function compactLowerAddresses(
  values: (Address | string | null | undefined)[],
) {
  return Array.from(
    new Set(
      values
        .filter((value): value is Address | string => !!value)
        .map((value) => value.toLowerCase()),
    ),
  )
}
