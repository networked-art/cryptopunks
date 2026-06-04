<template>
  <div class="watch-star">
    <Button
      class="icon-button"
      :class="{ watching }"
      @click="open = true"
    >
      <Icon name="lucide:star" />
      <span>{{ watching ? 'Watching' : 'Watch' }}</span>
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
          We'll email you about market activity for Punk #{{ punkId }}. Confirm
          your email once and you can unsubscribe from any alert with one click.
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

          <div class="events">
            <span class="label">Alert me when:</span>
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

// Once confirmed, the alert is active; we don't have a networked.art session here
// to read live state, so reflect the just-submitted intent in the star.
const watching = computed(() => submitted.value)

// Loose RFC-pragmatic check — good enough to catch typos before handoff.
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
        // The detail page (and so this control) only renders for canonical
        // CryptoPunks.
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
  email.value = ''
  error.value = null
  pending.value = false
  submitted.value = false
  selectedEvents.value = [...allEvents]
}
</script>

<style scoped>
.watch-star {
  display: contents;
}

.watching :deep(.icon) {
  color: var(--primary);
  fill: currentColor;
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
  gap: var(--size-2);
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
