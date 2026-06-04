<template>
  <div class="search-alert">
    <Button
      class="search-bar-action"
      @click="open = true"
    >
      Alert me
    </Button>

    <Dialog
      v-model:open="open"
      title="Alert me for this search"
      class="search-alert-dialog"
      compat
      @closed="reset"
    >
      <template v-if="!submitted">
        <p class="form-note muted">
          We'll email you when any of the
          <strong>{{ tokenIds.length }}</strong> punks matching
          <strong>“{{ label }}”</strong> are listed for sale, enter a new
          auction, or sell. Confirm your email once; unsubscribe anytime.
        </p>

        <form
          class="alert-form"
          @submit.prevent="submit"
        >
          <FormGroup>
            <FormLabel label="Email">
              <input
                v-model.trim="email"
                type="email"
                name="email"
                autocomplete="email"
                placeholder="you@example.com"
                required
              />
            </FormLabel>
          </FormGroup>

          <div class="events">
            <span class="label">Alert me when a match is:</span>
            <FormCheckbox
              v-for="option in eventOptions"
              :key="option.value"
              :model-value="selectedEvents.includes(option.value)"
              @update:model-value="toggleEvent(option.value)"
            >
              {{ option.label }}
            </FormCheckbox>
          </div>

          <p
            v-if="error"
            class="error"
          >
            {{ error }}
          </p>
        </form>
      </template>

      <p
        v-else
        class="form-note"
      >
        Check your inbox! We sent a confirmation link to
        <strong>{{ email }}</strong
        >. Confirm it to start receiving alerts for “{{ label }}”.
      </p>

      <template #footer>
        <template v-if="!submitted">
          <Button
            class="secondary"
            @click="open = false"
          >
            Cancel
          </Button>
          <Button
            class="primary"
            :disabled="pending || !selectedEvents.length"
            @click="submit"
          >
            {{ pending ? 'Sending…' : 'Create alert' }}
          </Button>
        </template>
        <Button
          v-else
          class="primary"
          @click="open = false"
        >
          Done
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { CRYPTOPUNKS_ADDRESS } from '~/utils/addresses'
import { postApi } from '~/utils/api'

const props = defineProps<{
  label: string
  tokenIds: readonly number[]
}>()

const open = ref(false)

const eventOptions = [
  { value: 'listed', label: 'Listed for sale' },
  { value: 'new_lot', label: 'Listed for auction' },
  { value: 'auction_start', label: 'Auction starts' },
  { value: 'sold', label: 'Sold' },
] as const

const allEvents = eventOptions.map((option) => option.value)

const email = ref('')
const selectedEvents = ref<string[]>([...allEvents])
const error = ref<string | null>(null)
const pending = ref(false)
const submitted = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toggleEvent(value: string) {
  selectedEvents.value = selectedEvents.value.includes(value)
    ? selectedEvents.value.filter((v) => v !== value)
    : [...selectedEvents.value, value]
}

async function submit() {
  if (pending.value) return
  if (!EMAIL_RE.test(email.value)) {
    error.value = 'Enter a valid email address.'
    return
  }
  if (!selectedEvents.value.length) {
    error.value = 'Pick at least one alert.'
    return
  }
  if (!props.tokenIds.length) {
    error.value = 'This search matches no punks to alert on.'
    return
  }
  error.value = null
  pending.value = true
  try {
    // The confirmation link lands the visitor back on this app. `?label` lets
    // the landing page name the search they alerted on, mirroring WatchStar's
    // `?punk`.
    const redirectUrl = new URL(
      `/alerts/confirmed?label=${encodeURIComponent(props.label)}`,
      'https://punks.auction',
    ).toString()
    await postApi('/watch/subscriptions', {
      email: email.value,
      source: 'punks_auctions',
      redirect_url: redirectUrl,
      label: props.label,
      events: selectedEvents.value,
      // Punk traits are immutable, so the resolved id set is stable; the API
      // matches events by membership and never needs the trait data itself.
      criteria: { token_ids: [...props.tokenIds] },
      scope: {
        contract_address: CRYPTOPUNKS_ADDRESS,
        token_id: null,
        search: props.label,
      },
    })
    submitted.value = true
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    pending.value = false
  }
}

function reset() {
  email.value = ''
  error.value = null
  pending.value = false
  submitted.value = false
  selectedEvents.value = [...allEvents]
}
</script>

<style scoped>
.search-alert {
  display: contents;
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.alert-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.events .label {
  color: var(--text-dim);
}

.events {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

.search-alert-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}
</style>
