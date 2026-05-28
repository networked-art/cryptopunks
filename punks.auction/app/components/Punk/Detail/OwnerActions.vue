<template>
  <ClientOnly>
    <section
      v-if="showSection"
      class="block"
    >
      <h2 class="block-title eyebrow">Owner Actions</h2>

      <div class="owner-panel">
        <dl class="state-grid">
          <div class="state-cell">
            <dt class="label">Custody</dt>
            <dd>{{ custodyLabel }}</dd>
          </div>

          <div class="state-cell">
            <dt class="label">Vault</dt>
            <dd>{{ vaultLabel }}</dd>
          </div>
        </dl>

        <p
          v-if="errorMessage"
          class="error"
        >
          {{ errorMessage }}
        </p>

        <div class="actions">
          <Button
            v-if="vaultAvailable"
            class="primary icon-button"
            :disabled="!canVault"
            @click="actVault"
          >
            <Icon name="lucide:archive" />
            <span>{{ vaultButtonLabel }}</span>
          </Button>

          <Button
            v-if="reclaimAvailable"
            class="icon-button"
            :disabled="!canReclaim"
            @click="actReclaim"
          >
            <Icon name="lucide:archive-restore" />
            <span>{{ reclaimButtonLabel }}</span>
          </Button>

          <Button
            v-if="unwrapAvailable"
            class="icon-button"
            :disabled="!canUnwrap"
            @click="actUnwrap"
          >
            <Icon name="lucide:package-open" />
            <span>{{ unwrapButtonLabel }}</span>
          </Button>
        </div>
      </div>

      <EvmTransactionFlowDialog
        ref="transactionDialogRef"
        :request="transactionRequest"
        :text="transactionText"
        skip-confirmation
        @complete="onTransactionComplete"
      />

      <EvmMultiTransactionFlowDialog
        ref="multiDialogRef"
        :title="multiDialogTitle"
        :steps="flowSteps"
        :text="multiDialogText"
        skip-confirmation
        @complete="onMultiTransactionComplete"
        @error="onFlowError"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import {
  CRYPTOPUNKS_721_ADDRESS,
  WRAPPED_PUNKS_ADDRESS,
  type ContractWritePlan,
} from '@networked-art/punks-sdk'
import { useConnection } from '@wagmi/vue'
import type { Address, Hash } from 'viem'
import type { AccountPunkInventoryItem } from '~/composables/useAccountPunkInventory'
import { TokenStandard, type TokenStandardValue } from '~/utils/auction'

const props = defineProps<{
  punkId: number
  standard: TokenStandardValue
}>()

const emit = defineEmits<{ changed: [tx: Hash] }>()

const { address } = useConnection()
const { sdk } = usePunksSdk()
const inventory = useAccountPunkInventory(() => address.value)
const custodyPlan = usePunkCustodyPlan()
const { refreshMarketState } = usePunkMarketState()
const optimistic = useOptimisticMarketPatch()
const detail = usePunkDetailDataContext()
const {
  owner: resolvedOwner,
  nativeOwner,
  isWrapped: detailIsWrapped,
  isVaulted: detailIsVaulted,
  reconcileOwner,
} = detail

const activeAction = ref<'unwrap' | 'vault' | 'reclaim' | null>(null)

// Synthesize an inventory item from detail state when the user is the resolved
// holder of a custodied Punk. Keeps owner actions available even when the
// indexer-backed inventory hasn't reached this punk yet.
const detailOwnerItem = computed<AccountPunkInventoryItem | null>(() => {
  if (
    !address.value ||
    !resolvedOwner.value ||
    !nativeOwner.value ||
    !sameAddress(resolvedOwner.value, address.value)
  ) {
    return null
  }
  const base = {
    key: `chain-${props.standard}-${props.punkId}`,
    punkId: props.punkId,
    standard: props.standard,
    owner: resolvedOwner.value,
    nativeOwner: nativeOwner.value,
    nativeStandard: null,
  } as const
  if (detailIsWrapped.value) {
    const wrapper = chainWrapperFor(nativeOwner.value)
    if (!wrapper) return null
    return {
      ...base,
      isWrapped: true,
      wrapper,
      custody: 'wrapped-wallet',
    }
  }
  if (detailIsVaulted.value) {
    return {
      ...base,
      isWrapped: false,
      wrapper: null,
      custody: 'vault',
    }
  }
  return null
})

const ownerItem = computed(
  () =>
    inventory.items.value.find(
      (item) =>
        item.standard === props.standard && item.punkId === props.punkId,
    ) ??
    detailOwnerItem.value ??
    undefined,
)

const unwrapAvailable = computed(() => {
  const item = ownerItem.value
  return !!item && isWrappedCustody(item) && hasSupportedWrapper(item)
})

const vaultAvailable = computed(() => {
  const item = ownerItem.value
  return (
    !!item &&
    props.standard === TokenStandard.CryptoPunks &&
    item.custody !== 'vault' &&
    item.custody !== 'unsupported'
  )
})

const reclaimAvailable = computed(() => {
  const item = ownerItem.value
  return (
    !!item &&
    props.standard === TokenStandard.CryptoPunks &&
    item.custody === 'vault'
  )
})

const showSection = computed(
  () =>
    props.standard === TokenStandard.CryptoPunks &&
    !!ownerItem.value &&
    (unwrapAvailable.value || vaultAvailable.value || reclaimAvailable.value),
)

const {
  pending,
  error: transactionError,
  transactionDialogRef,
  transactionRequest,
  transactionText,
  multiDialogRef,
  flowSteps,
  multiDialogText,
  multiDialogTitle,
  runPlans,
  onTransactionComplete,
  onMultiTransactionComplete,
  onFlowError,
} = useTransactionFlowRunner({
  onComplete: (tx) => {
    activeAction.value = null
    optimistic.flush()
    void inventory.refresh()
    void detail.refresh()
    scheduleMarketRefresh()
    emit('changed', tx)
  },
  onError: () => {
    activeAction.value = null
    optimistic.discard()
  },
})

const canUnwrap = computed(() => unwrapAvailable.value && !pending.value)
const canVault = computed(() => vaultAvailable.value && !pending.value)
const canReclaim = computed(() => reclaimAvailable.value && !pending.value)

const errorMessage = computed(
  () => transactionError.value ?? inventory.error.value,
)

const custodyLabel = computed(() => {
  const item = ownerItem.value
  if (!item) return 'Owned'

  switch (item.custody) {
    case 'wallet':
      return 'Wallet'
    case 'vault':
      return 'Punks Vault'
    case 'stash':
      return 'Stash'
    case 'wrapped-wallet':
      return wrapperLabel(item)
    case 'wrapped-stash':
      return `${wrapperLabel(item)} in Stash`
    default:
      return 'Unsupported'
  }
})

const vaultLabel = computed(() =>
  ownerItem.value?.custody === 'vault' ? 'Vaulted' : 'Not vaulted',
)

const unwrapButtonLabel = computed(() =>
  activeAction.value === 'unwrap' && pending.value ? 'Preparing...' : 'Unwrap',
)

const vaultButtonLabel = computed(() =>
  activeAction.value === 'vault' && pending.value
    ? 'Preparing...'
    : 'Send to Vault',
)

const reclaimButtonLabel = computed(() =>
  activeAction.value === 'reclaim' && pending.value
    ? 'Preparing...'
    : 'Reclaim',
)

async function actUnwrap() {
  if (!(await reconcileOwner())) return
  const item = ownerItem.value
  if (!item || !unwrapAvailable.value || pending.value) return

  activeAction.value = 'unwrap'
  stageUnwrapPatch(item)
  void runPlans(buildUnwrapPlans(item), {
    dialogTitle: 'Unwrap Punk',
    single: {
      title: { complete: 'Unwrap complete' },
      lead: { complete: 'Punk unwrapped.' },
    },
    multi: {
      title: { complete: 'Unwrap complete' },
      lead: { complete: 'Punk unwrapped.' },
    },
  })
}

async function actVault() {
  if (!(await reconcileOwner())) return
  const item = ownerItem.value
  const owner = address.value
  if (!item || !owner || !vaultAvailable.value || pending.value) return

  activeAction.value = 'vault'
  stageUnwrapPatch(item)
  void runPlans(
    custodyPlan.buildCustodyPlans({
      owner,
      vault: inventory.vault.value,
      vaultDeployed: inventory.vaultDeployed.value,
      stash: inventory.stash.value,
      items: [item],
    }),
    {
      dialogTitle: 'Vault Punk',
      single: {
        title: { complete: 'Vault complete' },
        lead: { complete: 'Punk moved into your Punks Vault.' },
      },
      multi: {
        title: { complete: 'Vault complete' },
        lead: { complete: 'Punk moved into your Punks Vault.' },
      },
    },
  )
}

async function actReclaim() {
  if (!(await reconcileOwner())) return
  const item = ownerItem.value
  const owner = address.value
  if (!item || !owner || !reclaimAvailable.value || pending.value) return

  activeAction.value = 'reclaim'
  const vault = inventory.vault.value
  if (!vault) {
    activeAction.value = null
    return
  }
  const plan = sdk.value.vault.at(vault).prepareTransferPunk({
    punkId: item.punkId,
    to: owner,
  })
  void runPlans([plan], {
    dialogTitle: 'Reclaim Punk',
    single: {
      title: { complete: 'Reclaim complete' },
      lead: { complete: 'Punk reclaimed from your Punks Vault.' },
    },
    multi: {
      title: { complete: 'Reclaim complete' },
      lead: { complete: 'Punk reclaimed from your Punks Vault.' },
    },
  })
}

async function buildUnwrapPlans(
  item: AccountPunkInventoryItem,
): Promise<ContractWritePlan[]> {
  const unwrapPlan = unwrapPlanFor(item)
  if (!unwrapPlan) {
    throw new Error(`Punk #${item.punkId} uses an unsupported wrapper.`)
  }

  const plans: ContractWritePlan[] = []
  if (item.custody === 'wrapped-stash') {
    const stash = inventory.stash.value
    const token = wrapperTokenAddress(item)
    if (!stash) throw new Error('Stash address is still loading.')
    if (!token) {
      throw new Error(`Punk #${item.punkId} uses an unsupported wrapper.`)
    }
    plans.push(
      sdk.value.stash.at(stash).prepareWithdrawERC721({
        token,
        tokenIds: [item.punkId],
      }),
    )
  }

  plans.push(unwrapPlan)
  return plans
}

function unwrapPlanFor(item: AccountPunkInventoryItem) {
  if (item.wrapper === 'cryptopunks_721') {
    return sdk.value.wrappers.c721.prepareUnwrapPunk(item.punkId)
  }
  if (item.wrapper === 'wrapped_punks') {
    return sdk.value.wrappers.legacy.prepareBurn(item.punkId)
  }
  return null
}

function wrapperTokenAddress(item: AccountPunkInventoryItem): Address | null {
  if (item.wrapper === 'cryptopunks_721') return CRYPTOPUNKS_721_ADDRESS
  if (item.wrapper === 'wrapped_punks') return WRAPPED_PUNKS_ADDRESS
  return null
}

function hasSupportedWrapper(item: AccountPunkInventoryItem) {
  return item.wrapper === 'cryptopunks_721' || item.wrapper === 'wrapped_punks'
}

function wrapperLabel(item: AccountPunkInventoryItem) {
  if (item.wrapper === 'wrapped_punks') return 'Legacy wrapped'
  return 'Wrapped'
}

function isWrappedCustody(item: AccountPunkInventoryItem) {
  return item.custody === 'wrapped-wallet' || item.custody === 'wrapped-stash'
}

function chainWrapperFor(native: Address) {
  if (sameAddress(native, WRAPPED_PUNKS_ADDRESS)) return 'wrapped_punks'
  if (sameAddress(native, CRYPTOPUNKS_721_ADDRESS)) return 'cryptopunks_721'
  return null
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

function stageUnwrapPatch(item: AccountPunkInventoryItem) {
  if (item.wrapper === 'cryptopunks_721') {
    optimistic.stage(item.punkId, { wrapped: false })
  } else if (item.wrapper === 'wrapped_punks') {
    optimistic.stage(item.punkId, { legacy_wrapped: false })
  } else {
    optimistic.discard()
  }
}

function scheduleMarketRefresh() {
  void refreshMarketState()
  setTimeout(() => void refreshMarketState(), 15000)
}
</script>

<style scoped>
.block {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.block-title {
  margin: 0;
}

.owner-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.state-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
}

.state-cell {
  min-width: 0;
}

.state-cell dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

.label {
  margin-bottom: var(--size-1);
  color: var(--text-dim);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  flex-wrap: wrap;
  padding-top: var(--size-3);
  border-top: var(--border);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

@media (max-width: 540px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
