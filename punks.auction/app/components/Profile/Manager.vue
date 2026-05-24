<template>
  <ClientOnly>
    <section class="profile-manager">
      <div class="manager-head">
        <div>
          <h2 class="section-title eyebrow">Account controls</h2>
          <p class="manager-note muted">
            Vault setup and account-wide claimable ETH.
          </p>
        </div>
        <Button
          class="small icon-button"
          :disabled="pending"
          @click="refresh"
        >
          <Icon name="lucide:refresh-cw" />
          <span>Refresh</span>
        </Button>
      </div>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <div class="manager-grid">
        <section class="manager-section">
          <div class="section-head">
            <h3>PunksVault</h3>
            <Tag
              small
              class="status-tag"
              :class="{ active: vaultDeployed }"
            >
              {{ vaultStatusLabel }}
            </Tag>
          </div>

          <p
            v-if="pending && !vaultAddress"
            class="muted"
          >
            Loading vault status...
          </p>

          <dl
            v-else
            class="status-list"
          >
            <div v-if="vaultAddress">
              <dt>Vault address</dt>
              <dd>
                <a
                  :href="addressUrl(vaultAddress)"
                  target="_blank"
                  rel="noopener"
                >
                  <Account :address="vaultAddress" />
                </a>
              </dd>
            </div>
            <div v-if="vaultOwner">
              <dt>Owner</dt>
              <dd>
                <Account :address="vaultOwner" />
              </dd>
            </div>
            <div>
              <dt>Auction operator</dt>
              <dd :class="auctionApproved ? 'text-ok' : 'muted'">
                {{ auctionApproved ? 'Approved' : 'Not approved' }}
              </dd>
            </div>
            <div>
              <dt>ETH at vault</dt>
              <dd>
                <EthAmount
                  v-if="vaultBalance > 0n"
                  :wei="vaultBalance"
                />
                <span
                  v-else
                  class="muted"
                  >None</span
                >
              </dd>
            </div>
          </dl>

          <p
            v-if="vaultOwner && !vaultOwnerMatches"
            class="warn"
          >
            This vault is deployed, but it is not owned by the connected
            account.
          </p>

          <div
            v-if="canSetupVault"
            class="actions"
          >
            <Button
              class="primary icon-button"
              :disabled="pending"
              @click="actSetupVault"
            >
              <Icon name="lucide:shield-check" />
              <span>{{ setupVaultLabel }}</span>
            </Button>
          </div>
        </section>

        <section class="manager-section">
          <div class="section-head">
            <h3>Claimable ETH</h3>
            <div class="section-actions">
              <Button
                v-if="hasMultipleClaimableBalances"
                class="primary small icon-button"
                :disabled="pending"
                @click="actWithdrawClaimable"
              >
                <Icon name="lucide:download" />
                <span>Withdraw all</span>
              </Button>
              <Tag
                small
                class="status-tag"
                :class="{ active: hasClaimableBalance }"
              >
                {{ hasClaimableBalance ? 'Available' : 'None' }}
              </Tag>
            </div>
          </div>

          <dl class="balance-list">
            <div class="balance-row">
              <div>
                <dt>CryptoPunks market</dt>
                <dd>
                  <EthAmount
                    v-if="canonicalMarketBalance > 0n"
                    :wei="canonicalMarketBalance"
                  />
                  <span
                    v-else
                    class="muted"
                    >None</span
                  >
                </dd>
              </div>
              <Button
                v-if="canonicalMarketBalance > 0n"
                class="primary small icon-button"
                :disabled="pending"
                @click="actWithdrawCanonicalMarket"
              >
                <Icon name="lucide:download" />
                <span>Withdraw</span>
              </Button>
            </div>

            <div class="balance-row">
              <div>
                <dt>PunksAuction balance</dt>
                <dd>
                  <EthAmount
                    v-if="auctionBalance > 0n"
                    :wei="auctionBalance"
                  />
                  <span
                    v-else
                    class="muted"
                    >None</span
                  >
                </dd>
              </div>
              <Button
                v-if="auctionBalance > 0n"
                class="primary small icon-button"
                :disabled="pending"
                @click="actWithdrawAuctionBalance"
              >
                <Icon name="lucide:download" />
                <span>Withdraw</span>
              </Button>
            </div>
          </dl>
        </section>
      </div>

      <EvmMultiTransactionFlowDialog
        ref="dialogRef"
        chain="mainnet"
        :steps="flowSteps"
        :text="dialogText"
        skip-confirmation
        @complete="onComplete"
        @error="onFlowError"
      />
    </section>
  </ClientOnly>
</template>

<script setup lang="ts">
import type {
  MultiTransactionFlowStep,
  MultiTransactionFlowText,
} from '@1001-digital/components.evm'
import {
  cryptoPunksMarketAbi,
  punksAuctionAbi,
  punkVaultAbi,
  punkVaultFactoryAbi,
  type ContractWritePlan,
} from '@networked-art/punks-sdk'
import type { Address, TransactionReceipt } from 'viem'
import { CRYPTOPUNKS_ADDRESS, PUNKS_AUCTION_ADDRESS } from '~/utils/addresses'
import { addressUrl } from '~/utils/explorer'

const props = defineProps<{
  account: Address
}>()

const { sdk, publicClient } = usePunksSdk()
const { execute } = useWritePlan()

const pending = ref(false)
const error = ref<string | null>(null)
const vaultAddress = ref<Address | null>(null)
const vaultOwner = ref<Address | null>(null)
const vaultDeployed = ref(false)
const auctionApproved = ref(false)
const vaultBalance = ref<bigint>(0n)
const canonicalMarketBalance = ref<bigint>(0n)
const auctionBalance = ref<bigint>(0n)
let refreshToken = 0

const vaultOwnerMatches = computed(
  () => !vaultOwner.value || sameAddress(vaultOwner.value, props.account),
)
const canSetupVault = computed(
  () =>
    !vaultDeployed.value || (!auctionApproved.value && vaultOwnerMatches.value),
)
const setupVaultLabel = computed(() =>
  vaultDeployed.value ? 'Approve auction' : 'Deploy and approve',
)
const vaultStatusLabel = computed(() =>
  vaultDeployed.value ? 'Deployed' : 'Not deployed',
)
const hasClaimableBalance = computed(
  () => canonicalMarketBalance.value > 0n || auctionBalance.value > 0n,
)
const hasMultipleClaimableBalances = computed(
  () => canonicalMarketBalance.value > 0n && auctionBalance.value > 0n,
)

async function refresh() {
  const token = ++refreshToken
  const c = publicClient.value
  if (!c) {
    reset()
    return
  }

  pending.value = true
  error.value = null
  try {
    const vaultFactory = (await c.readContract({
      address: PUNKS_AUCTION_ADDRESS,
      abi: punksAuctionAbi,
      functionName: 'VAULTS',
    })) as Address
    const vault = (await c.readContract({
      address: vaultFactory,
      abi: punkVaultFactoryAbi,
      functionName: 'predictVault',
      args: [props.account],
    })) as Address
    const [code, nextVaultBalance, nextMarketBalance, nextAuctionBalance] =
      await Promise.all([
        c.getBytecode({ address: vault }).catch(() => undefined),
        c.getBalance({ address: vault }).catch(() => 0n),
        c
          .readContract({
            address: CRYPTOPUNKS_ADDRESS,
            abi: cryptoPunksMarketAbi,
            functionName: 'pendingWithdrawals',
            args: [props.account],
          })
          .catch(() => 0n) as Promise<bigint>,
        c
          .readContract({
            address: PUNKS_AUCTION_ADDRESS,
            abi: punksAuctionAbi,
            functionName: 'balances',
            args: [props.account],
          })
          .catch(() => 0n) as Promise<bigint>,
      ])
    const deployed = !!code && code !== '0x'

    let nextOwner: Address | null = null
    let nextApproved = false
    if (deployed) {
      const [owner, approved] = await Promise.all([
        c.readContract({
          address: vault,
          abi: punkVaultAbi,
          functionName: 'owner',
        }) as Promise<Address>,
        c.readContract({
          address: vault,
          abi: punkVaultAbi,
          functionName: 'isOperator',
          args: [PUNKS_AUCTION_ADDRESS],
        }) as Promise<boolean>,
      ])
      nextOwner = owner
      nextApproved = approved
    }

    if (token !== refreshToken) return
    vaultAddress.value = vault
    vaultDeployed.value = deployed
    vaultOwner.value = nextOwner
    auctionApproved.value = nextApproved
    vaultBalance.value = nextVaultBalance
    canonicalMarketBalance.value = nextMarketBalance
    auctionBalance.value = nextAuctionBalance
  } catch (e) {
    if (token !== refreshToken) return
    reset()
    error.value = (e as Error).message
  } finally {
    if (token === refreshToken) pending.value = false
  }
}

function reset() {
  vaultAddress.value = null
  vaultOwner.value = null
  vaultDeployed.value = false
  auctionApproved.value = false
  vaultBalance.value = 0n
  canonicalMarketBalance.value = 0n
  auctionBalance.value = 0n
}

watch([() => props.account, publicClient], () => void refresh(), {
  immediate: true,
})

type DialogRef = {
  start: () => void
} | null
const dialogRef = ref<DialogRef>(null)
const flowSteps = ref<MultiTransactionFlowStep[]>([])
const dialogText = ref<MultiTransactionFlowText>({})

async function run(planInput: ContractWritePlan | Promise<ContractWritePlan>) {
  try {
    const plan = await planInput
    await runSteps([stepFromPlan(planId(plan.description), plan)])
  } catch (e) {
    error.value = (e as Error).message
  }
}

function stepFromPlan(
  id: string,
  plan: ContractWritePlan,
): MultiTransactionFlowStep {
  return {
    id,
    title: plan.description,
    lead: plan.description,
    request: () => execute(plan),
  }
}

async function runSteps(
  steps: MultiTransactionFlowStep[],
  text: MultiTransactionFlowText = {
    title: { complete: 'Transaction complete' },
    lead: { complete: 'Transaction confirmed.' },
  },
) {
  if (!steps.length) return

  error.value = null
  flowSteps.value = steps
  dialogText.value = text
  await nextTick()
  dialogRef.value?.start()
}

function planId(description: string) {
  return description.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function onComplete(_receipts: TransactionReceipt[]) {
  refresh()
}

function onFlowError(message: string) {
  error.value = message
}

function actSetupVault() {
  void run(sdk.value.auctions.prepareEnsureMyVault([PUNKS_AUCTION_ADDRESS]))
}

async function actWithdrawClaimable() {
  try {
    const steps: MultiTransactionFlowStep[] = []
    if (canonicalMarketBalance.value > 0n) {
      steps.push(
        stepFromPlan(
          'withdraw-cryptopunks-market',
          sdk.value.market.prepareWithdraw(),
        ),
      )
    }
    if (auctionBalance.value > 0n) {
      steps.push(
        stepFromPlan(
          'withdraw-punks-auction',
          sdk.value.auctions.prepareWithdraw(),
        ),
      )
    }

    await runSteps(steps, {
      title: { complete: 'Withdrawals complete' },
      lead: { complete: 'Claimable ETH withdrawn.' },
    })
  } catch (e) {
    error.value = (e as Error).message
  }
}

function actWithdrawCanonicalMarket() {
  void run(sdk.value.market.prepareWithdraw())
}

function actWithdrawAuctionBalance() {
  void run(sdk.value.auctions.prepareWithdraw())
}

function sameAddress(a?: Address | string | null, b?: Address | string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
</script>

<style scoped>
.profile-manager {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.manager-head,
.section-head,
.balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
}

.manager-head {
  flex-wrap: wrap;
}

.section-title,
.manager-note,
.section-head h3 {
  margin: 0;
}

.manager-note {
  margin-top: var(--size-1);
  font-size: var(--font-sm);
}

.manager-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-3);
}

.manager-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
  padding: var(--size-3);
  border: var(--border);
}

.section-head h3 {
  font-size: var(--font-md);
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.status-list,
.balance-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.status-list > div,
.balance-row {
  min-width: 0;
}

.status-list > div {
  display: grid;
  grid-template-columns: minmax(9rem, max-content) minmax(0, 1fr);
  gap: var(--size-3);
  align-items: baseline;
}

.balance-row {
  padding-top: var(--size-2);
}

.balance-row + .balance-row {
  border-top: var(--border);
}

dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-md);
}

dd {
  margin: 0;
  min-width: 0;
  font-size: var(--font-sm);
}

a {
  border: 0;
}

.status-tag {
  flex: 0 0 auto;
  cursor: default;
}

.text-ok {
  color: var(--text);
}

.actions {
  display: flex;
  gap: var(--size-2);
  flex-wrap: wrap;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
}

.warn,
.error {
  margin: 0;
  font-size: var(--font-xs);
}

.warn {
  color: var(--accent-strong);
}

.error {
  color: var(--accent);
}

@media (max-width: 760px) {
  .manager-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .manager-head,
  .section-head,
  .balance-row {
    align-items: flex-start;
  }

  .status-list > div,
  .balance-row {
    grid-template-columns: 1fr;
  }

  .balance-row {
    flex-direction: column;
  }
}
</style>
