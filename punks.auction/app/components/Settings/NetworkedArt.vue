<template>
  <section class="settings-section na-panel">
    <h2 class="section-title eyebrow">networked.art</h2>

    <p
      v-if="!ready && pending"
      class="muted setting-status"
    >
      Checking your account…
    </p>

    <!-- Linked: show the account + its watchlist -->
    <template v-else-if="isAuthenticated">
      <p class="muted setting-status">
        Synced as <code>{{ identity }}</code>
      </p>

      <div class="watchlist">
        <h3 class="subhead eyebrow">Watchlist</h3>

        <p
          v-if="watchPending && !watchItems.length"
          class="muted"
        >
          Loading…
        </p>
        <p
          v-else-if="!watchItems.length"
          class="muted"
        >
          You're not watching anything yet. Use the star on a Punk, or “Alert
          me” on a search, to start.
        </p>
        <ul
          v-else
          class="watch-items"
        >
          <li
            v-for="item in watchItems"
            :key="item.id"
            class="watch-item"
          >
            <div class="watch-item-text">
              <p class="watch-item-title">{{ item.label || item.description }}</p>
              <p class="watch-item-events muted">{{ eventSummary(item.events) }}</p>
            </div>
            <Button
              class="icon-button"
              title="Remove alert"
              @click="removeWatch(item.id)"
            >
              <Icon name="lucide:x" />
            </Button>
          </li>
        </ul>

        <p
          v-if="watchError"
          class="error"
        >
          {{ watchError }}
        </p>
      </div>

      <Button
        class="danger"
        @click="disconnect"
      >
        <Icon name="lucide:log-out" />
        <span>Disconnect networked.art</span>
      </Button>
    </template>

    <!-- Not linked: offer wallet (SIWE) and email sign-in -->
    <template v-else>
      <p class="muted setting-status">
        Sync your account with networked.art to receive email alerts and manage
        your watchlist across the network.
      </p>

      <Button
        class="primary"
        :disabled="siweBusy"
        @click="signInWallet"
      >
        <Icon name="lucide:wallet" />
        <span>{{ siweBusy ? siweStatus : 'Sign in with your wallet' }}</span>
      </Button>

      <p
        v-if="siweError"
        class="error"
      >
        {{ siweError }}
      </p>

      <div class="email-alt">
        <p
          v-if="!showEmail"
          class="muted"
        >
          <a
            href="#"
            @click.prevent="showEmail = true"
            >Use email instead</a
          >
        </p>

        <Form
          v-else-if="emailStep === 'request'"
          @submit.prevent="requestCode"
        >
          <FormGroup>
            <FormLabel label="Email">
              <FormInputGroup>
                <input
                  v-model.trim="email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  placeholder="you@example.com"
                  required
                />
                <Button
                  class="secondary"
                  type="submit"
                  :disabled="emailBusy"
                >
                  {{ emailBusy ? 'Sending…' : 'Send code' }}
                </Button>
              </FormInputGroup>
            </FormLabel>
          </FormGroup>
        </Form>

        <Form
          v-else
          @submit.prevent="verifyCode"
        >
          <p class="muted">
            Enter the 6-digit code we sent to <strong>{{ email }}</strong
            >.
          </p>
          <PinInput
            v-model="code"
            :length="6"
            type="number"
            otp
            :disabled="emailBusy"
            @complete="verifyCode"
          />
          <p class="muted">
            <a
              href="#"
              @click.prevent="resetEmail"
              >Use a different email</a
            >
          </p>
        </Form>

        <p
          v-if="emailError"
          class="error"
          role="alert"
        >
          {{ emailError }}
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'

// `useSiwe` is auto-imported via the layers.evm layer (it re-exports the
// components.evm composable), matching how the rest of the app pulls layer
// helpers — no explicit import needed.

// Same event vocabulary the watch flows write (WatchStar / SearchAlert).
const EVENT_LABELS: Record<string, string> = {
  listed: 'Listed for sale',
  new_lot: 'Listed for auction',
  auction_start: 'Auction starts',
  sold: 'Sold',
}

const na = useNetworkedArt()
const { user, ready, pending, isAuthenticated } = na

const {
  items: watchItems,
  pending: watchPending,
  error: watchError,
  load: loadWatchlist,
  remove: removeWatch,
  clear: clearWatchlist,
} = useWatchlist()

const eventSummary = (events: string[]) =>
  events.map((event) => EVENT_LABELS[event] ?? event).join(' · ')

const identity = computed(() => {
  const account = user.value
  if (!account) return ''
  if (account.email) return account.email
  const primary =
    account.addresses.find((entry) => entry.is_primary) ?? account.addresses[0]
  if (!primary) return 'your wallet'
  return primary.ens_name ?? shortAddress(primary.address)
})

// ---- SIWE ----
const siwe = useSiwe()
const siweBusy = computed(
  () => siwe.step.value === 'signing' || siwe.step.value === 'verifying',
)
const siweStatus = computed(() => siwe.statusText.value || 'Signing…')
const siweError = ref<string | null>(null)

const signInWallet = async () => {
  siweError.value = null
  const result = await siwe.signIn({
    getNonce: na.getNonce,
    verify: na.verifySiwe,
    statement: 'Sign in to sync your account with networked.art.',
  })
  if (!result) siweError.value = siwe.errorMessage.value || 'Sign-in failed.'
}

// ---- Email PIN ----
const showEmail = ref(false)
const emailStep = ref<'request' | 'code'>('request')
const email = ref('')
// PinInput models the code as one entry per digit.
const code = ref<string[]>([])
const emailBusy = ref(false)
const emailError = ref<string | null>(null)

const requestCode = async () => {
  if (emailBusy.value) return
  emailError.value = null
  emailBusy.value = true
  try {
    await na.requestEmailCode(email.value)
    emailStep.value = 'code'
  } catch {
    emailError.value = 'Could not send a code. Check the address and try again.'
  } finally {
    emailBusy.value = false
  }
}

const verifyCode = async () => {
  if (emailBusy.value) return
  const joined = code.value.join('')
  if (!/^\d{6}$/.test(joined)) {
    emailError.value = 'Enter the 6-digit code.'
    return
  }
  emailError.value = null
  emailBusy.value = true
  try {
    await na.verifyEmailCode(email.value, Number(joined))
  } catch {
    emailError.value = 'That code is invalid or expired.'
    code.value = []
  } finally {
    emailBusy.value = false
  }
}

const resetEmail = () => {
  emailStep.value = 'request'
  code.value = []
  emailError.value = null
}

const disconnect = async () => {
  // signOut() drops the user, which flips isAuthenticated and lets the watch
  // below clear the watchlist — no manual reset needed here.
  await na.signOut()
}

// Resolve the link on mount, then keep the watchlist in step with auth state:
// load on sign-in, clear on sign-out (or a token the API rejected).
onMounted(() => na.refresh())
watch(
  isAuthenticated,
  (authed) => {
    if (authed) loadWatchlist()
    else clearWatchlist()
  },
  { immediate: true },
)
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.setting-status {
  margin: 0;
  font-size: var(--font-md);
}

.subhead {
  margin: 0 0 var(--size-2);
}

.watchlist {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.watch-items {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.watch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-3);
  padding: var(--size-2) var(--size-3);
  border: var(--border);
  background: var(--bg-elevated);
}

.watch-item-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.watch-item-title {
  margin: 0;
  font-size: var(--font-sm);
}

.watch-item-events {
  margin: 0;
  font-size: var(--font-xs);
}

.email-alt {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.email-alt > p {
  margin: 0;
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}
</style>
