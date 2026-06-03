<template>
  <div class="broker-contact">
    <Button @click="open = true">Contact broker</Button>

    <Dialog
      v-model:open="open"
      title="Contact broker"
      class="broker-dialog"
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
          <p
            v-if="ownerLastActiveAgo"
            class="last-active"
          >
            Owner last active {{ ownerLastActiveAgo }}
          </p>
        </div>
      </div>

      <template v-if="!submitted">
        <p class="form-note muted">
          Leave your email and a broker may reach out to discuss placing a bid
          or arranging a private sale. Submitting this doesn’t guarantee a
          response or a placement.
        </p>

        <form
          class="broker-form"
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
        Thanks — we’ve got your email. A broker may reach out if there’s a
        match, but a response isn’t guaranteed.
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
            @click="submit"
          >
            Request contact
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
import type { Address } from 'viem'

defineProps<{
  punkId: number
}>()

const route = useRoute()
const router = useRouter()

// Mirror the contact modal in the URL so an open dialog is linkable. The query
// is the source of truth on load; opening or closing writes it back.
const open = ref(route.query.broker === 'open')

watch(open, (isOpen) => {
  if ((route.query.broker === 'open') === isOpen) return
  const { broker: _omit, ...rest } = route.query
  router.replace({ query: isOpen ? { ...rest, broker: 'open' } : rest })
})

watch(
  () => route.query.broker,
  (value) => {
    open.value = value === 'open'
  },
)

// Owner's wallet last-active, sourced from the indexer's tx-from tracking, so a
// broker can gauge how reachable the holder is. Custody set covers vault/stash;
// the EOA drives the last-active lookup.
const { owner: resolvedOwner, nativeOwner } = usePunkDetailDataContext()
const ownerAddresses = computed<Address[]>(() => {
  const set = new Set<Address>()
  if (resolvedOwner.value) set.add(resolvedOwner.value)
  if (nativeOwner.value) set.add(nativeOwner.value)
  return [...set]
})
const { stats: ownerStats } = useAccountStats({
  addresses: ownerAddresses,
  eoa: () => resolvedOwner.value ?? undefined,
})
const ownerLastActiveIso = computed(() =>
  ownerStats.value.lastActiveAt
    ? new Date(ownerStats.value.lastActiveAt * 1000).toISOString()
    : undefined,
)
const ownerLastActiveAgo = useTimeAgo(ownerLastActiveIso)

const email = ref('')
const error = ref<string | null>(null)
const submitted = ref(false)

// Loose RFC-pragmatic check — good enough to catch typos before handoff.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function submit() {
  if (!EMAIL_RE.test(email.value)) {
    error.value = 'Enter a valid email address.'
    return
  }
  error.value = null
  // No collection endpoint is wired yet; capture intent client-side and a
  // broker follows up out of band. Swap this for a POST when the backend lands.
  submitted.value = true
}

function reset() {
  email.value = ''
  error.value = null
  submitted.value = false
}
</script>

<style scoped>
.broker-contact {
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

.last-active {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-dim);
}

.form-note {
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.broker-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.field .label {
  color: var(--text-dim);
}

.field input {
  width: 100%;
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

.broker-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}
</style>
