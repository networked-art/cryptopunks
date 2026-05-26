<template>
  <ClientOnly>
    <div
      v-if="ownAccount"
      class="offers-tab"
    >
      <section class="offers-section">
        <header class="section-head">
          <h2 class="section-title eyebrow">Made by me</h2>
          <Button
            class="small icon-button"
            :disabled="offersPending"
            @click="refreshOffers"
          >
            <Icon name="lucide:refresh-cw" />
            <span>Refresh</span>
          </Button>
        </header>

        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>

        <p
          v-if="!madeByMe.length"
          class="muted empty"
        >
          You have no open purchase offers.
        </p>
        <ul
          v-else
          class="offer-list"
        >
          <li
            v-for="offer in madeByMe"
            :key="String(offer.id)"
            class="offer-row"
          >
            <LazyOfferCard :offer="offer" />
            <div class="row-actions">
              <Button
                class="icon-button"
                :disabled="pending"
                @click="actCancel(offer.id)"
              >
                <Icon name="lucide:x" />
                <span>Cancel offer</span>
              </Button>
            </div>
          </li>
        </ul>
      </section>

      <section class="offers-section">
        <h2 class="section-title eyebrow">Received on my punks</h2>

        <p
          v-if="!received.length"
          class="muted empty"
        >
          No standing offers target Punks you hold.
        </p>
        <ul
          v-else
          class="offer-list"
        >
          <li
            v-for="offer in received"
            :key="String(offer.id)"
            class="offer-row"
          >
            <LazyOfferCard :offer="offer" />
            <div class="row-actions">
              <NuxtLink
                class="details-link"
                :to="`/purchase-offers/${offer.id}`"
              >
                Review and accept
                <Icon name="lucide:arrow-right" />
              </NuxtLink>
            </div>
          </li>
        </ul>
      </section>

      <EvmTransactionFlowDialog
        ref="dialogRef"
        :request="transactionRequest"
        :text="transactionText"
        skip-confirmation
        @complete="onComplete"
      />
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { Hash, TransactionReceipt } from 'viem'
import type { TransactionFlowText } from '~/types/transactionFlow'
import { transactionTitleForPlan } from '~/utils/transactionFlowText'

useOwnProfileGuard()

const { ownAccount, resolvedAddress, vault, stash } = useProfileContext()
const profileAddress = computed(() => resolvedAddress.value ?? undefined)

const { sdk } = usePunksSdk()
const { execute } = useWritePlan()

const { offers, pending: offersPending, refresh: refreshOffers } = useOffers()

const { ids: owned } = useAccountPunks({
  account: profileAddress,
  vault,
  stash,
})

const ownerAddresses = computed(() => {
  const set = new Set<string>()
  const a = resolvedAddress.value?.toLowerCase()
  if (a) set.add(a)
  const v = vault.value?.toLowerCase()
  if (v) set.add(v)
  const s = stash.value?.toLowerCase()
  if (s) set.add(s)
  return set
})

const madeByMe = computed(() => {
  const addrs = ownerAddresses.value
  if (!addrs.size) return []
  return offers.value.filter((offer) => addrs.has(offer.offerer.toLowerCase()))
})

// Offer slots can target specific punks by id or by trait criteria. The
// trait-criteria path needs per-punk metadata to evaluate, so V1 of this tab
// matches only the explicit `includeIds` path — covers single-punk and
// hand-picked bundle offers, which are the common shape. Pure criteria-only
// offers are surfaced via the offer detail page rather than here.
const ownedSet = computed(() => new Set(owned.value))
const made = computed(() => new Set(madeByMe.value.map((o) => String(o.id))))
const received = computed(() => {
  const ids = ownedSet.value
  if (!ids.size) return []
  return offers.value.filter((offer) => {
    if (made.value.has(String(offer.id))) return false
    return offer.slots.some((slot) => slot.includeIds.some((id) => ids.has(id)))
  })
})

const pending = ref(false)
const error = ref<string | null>(null)

type TransactionDialogRef = {
  initializeRequest: () => void
} | null
const dialogRef = ref<TransactionDialogRef>(null)
const transactionRequest = ref<(() => Promise<Hash>) | undefined>()
const transactionText = ref<TransactionFlowText>({})

async function actCancel(offerId: bigint) {
  if (pending.value) return
  try {
    pending.value = true
    error.value = null
    const plan = sdk.value.auctions.prepareCancelOffer(offerId)
    const title = transactionTitleForPlan(plan)
    transactionRequest.value = () => execute(plan)
    transactionText.value = {
      title: {
        confirm: title,
        requesting: title,
        waiting: title,
        complete: 'Offer cancelled',
      },
      lead: {
        confirm: plan.description,
        requesting: plan.description,
        waiting: plan.description,
        complete: 'Locked ETH refunded to your wallet.',
      },
    }
    await nextTick()
    dialogRef.value?.initializeRequest()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    pending.value = false
  }
}

function onComplete(_receipt: TransactionReceipt) {
  void refreshOffers()
}
</script>

<style scoped>
.offers-tab {
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
}

.offers-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2);
}

.section-title {
  margin: 0;
}

.empty {
  padding: var(--size-4);
  border: var(--border);
  text-align: center;
  font-size: var(--font-sm);
}

.offer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--size-3);
}

.offer-row {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  min-width: 0;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--size-2);
}

.details-link {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  border: 0;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
}

.error {
  color: var(--accent);
  font-size: var(--font-sm);
  margin: 0;
}
</style>
