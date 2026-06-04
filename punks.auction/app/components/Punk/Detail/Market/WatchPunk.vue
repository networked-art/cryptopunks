<template>
  <div class="watch-punk">
    <Button @click="open = true">
      {{ watching ? 'Watching' : 'Watch' }}
    </Button>

    <Dialog
      v-model:open="open"
      title="Watch this punk"
      class="watch-dialog"
      compat
      @closed="reset"
    >
      <div class="dialog-intro">
        <PunkThumb
          class="intro-thumb"
          :punk-id="punkId"
          :size="56"
          :link="false"
        />
        <div class="intro-meta">
          <p class="intro-id">Punk #{{ punkId }}</p>
          <p class="intro-sub muted">Get an email on market activity</p>
        </div>
      </div>

      <template v-if="!submitted">
        <p class="form-note muted">
          We'll email you when Punk #{{ punkId }} is listed for sale, an auction
          starts, or it sells. Confirm your email once and you can unsubscribe
          from any alert with one click.
        </p>

        <form
          class="watch-form"
          @submit.prevent="submit"
        >
          <label class="field">
            <span class="label">Email</span>
            <input
              v-model.trim="email"
              type="email"
              name="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <fieldset class="events">
            <legend class="label">Alert me when it's</legend>
            <label
              v-for="option in eventOptions"
              :key="option.value"
              class="event-option"
            >
              <input
                v-model="selectedEvents"
                type="checkbox"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </fieldset>

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
        >. Confirm it to start receiving alerts for Punk #{{ punkId }}.
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
            {{ pending ? 'Sending…' : 'Watch punk' }}
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
  punkId: number
}>()

const route = useRoute()
const router = useRouter()

// Mirror the dialog in the URL so an open watch dialog is linkable, matching the
// broker-contact dialog's behaviour.
const open = ref(route.query.watch === 'open')

watch(open, (isOpen) => {
  if ((route.query.watch === 'open') === isOpen) return
  const { watch: _omit, ...rest } = route.query
  router.replace({ query: isOpen ? { ...rest, watch: 'open' } : rest })
})

watch(
  () => route.query.watch,
  (value) => {
    open.value = value === 'open'
  },
)

const eventOptions = [
  { value: 'listed', label: 'listed for sale' },
  { value: 'auction_started', label: 'in a new auction' },
  { value: 'sold', label: 'sold' },
] as const

const email = ref('')
const selectedEvents = ref<string[]>(['listed', 'auction_started', 'sold'])
const error = ref<string | null>(null)
const pending = ref(false)
const submitted = ref(false)

// Once confirmed, the alert is active; we don't have a networked.art session here
// to read live state, so reflect the just-submitted intent in the button label.
const watching = computed(() => submitted.value)

// Loose RFC-pragmatic check — good enough to catch typos before handoff.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  error.value = null
  pending.value = true
  try {
    // The confirmation link lands the visitor back on this app. The API only
    // allows redirects to this app's own origin; `?punk` lets the landing page
    // show context.
    const redirectUrl = new URL(
      `/alerts/confirmed?punk=${props.punkId}`,
      'https://punks.auction',
    ).toString()
    await postApi('/watch/subscriptions', {
      email: email.value,
      source: 'punks_auctions',
      redirect_url: redirectUrl,
      label: `Punk #${props.punkId}`,
      events: selectedEvents.value,
      scope: {
        // Market (and so this form) only renders for canonical CryptoPunks.
        contract_address: CRYPTOPUNKS_ADDRESS,
        token_id: String(props.punkId),
        search: null,
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
  if (submitted.value) return
  email.value = ''
  error.value = null
  pending.value = false
  selectedEvents.value = ['listed', 'auction_started', 'sold']
}
</script>

<style scoped>
.watch-punk {
  display: contents;
}

.dialog-intro {
  display: flex;
  align-items: center;
  gap: var(--size-3);
}

.intro-thumb {
  flex-shrink: 0;
}

.intro-meta {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  min-width: 0;
}

.intro-id {
  margin: 0;
  font-size: var(--font-md);
}

.intro-sub {
  margin: 0;
  font-size: var(--font-xs);
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.watch-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.field .label,
.events .label {
  color: var(--text-dim);
}

.field input {
  width: 100%;
}

.events {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
  margin: 0;
  padding: 0;
  border: 0;
}

.event-option {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  font-size: var(--font-sm);
}

.event-option input {
  width: auto;
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

.watch-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}
</style>
