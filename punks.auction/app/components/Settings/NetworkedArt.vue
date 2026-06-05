<template>
  <section class="settings-section na-panel">
    <h2 class="section-title eyebrow">networked.art</h2>

    <p
      v-if="!ready && pending"
      class="muted setting-status"
    >
      Checking your account…
    </p>

    <!-- Linked: show the account + disconnect -->
    <template v-else-if="isAuthenticated">
      <p class="muted setting-status">
        Synced as <code>{{ identity }}</code>
      </p>

      <Button
        class="danger"
        @click="disconnect"
      >
        <Icon name="lucide:log-out" />
        <span>Disconnect networked.art</span>
      </Button>
    </template>

    <!-- Not linked: offer email sign-in -->
    <template v-else>
      <p class="muted setting-status">
        Sync your account with networked.art to receive email alerts and manage
        your watchlist across the network.
      </p>

      <Form
        v-if="emailStep === 'request'"
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
                class="primary"
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
    </template>
  </section>
</template>

<script setup lang="ts">
import { shortAddress } from '@1001-digital/layers.evm/app/utils/addresses'

const na = useNetworkedArt()
const { user, ready, pending, isAuthenticated } = na

const identity = computed(() => {
  const account = user.value
  if (!account) return ''
  if (account.email) return account.email
  const primary =
    account.addresses.find((entry) => entry.is_primary) ?? account.addresses[0]
  if (!primary) return 'your wallet'
  return primary.ens_name ?? shortAddress(primary.address)
})

// ---- Email PIN ----
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
  // signOut() drops the shared user state, flipping isAuthenticated app-wide —
  // the panel falls back to the sign-in view and the Watchlist tab disappears.
  await na.signOut()
}

// Resolve the account link on mount so the panel reflects the real auth state.
// Guarded so it doesn't re-fetch when another mounted consumer (e.g. the
// profile's Watchlist tab) already resolved or is resolving the link.
onMounted(() => {
  if (na.isConfigured && !ready.value && !pending.value) void na.refresh()
})
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

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}
</style>
