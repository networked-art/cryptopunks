<template>
  <div class="inquire">
    <Button
      class="icon-button"
      @click="open = true"
    >
      <Icon name="lucide:message-circle" />
      <span>Inquire</span>
    </Button>

    <Dialog
      v-model:open="open"
      title="Inquire about this punk"
      class="inquire-dialog"
      compat
      @closed="reset"
    >
      <a
        class="canon-credit"
        href="https://canonart.co/"
        target="_blank"
        rel="noopener"
      >
        <span class="muted">Brokerage by</span>
        <img
          class="canon-logo"
          src="https://cdn.punks.auction/canon.svg"
          alt="Canon"
        />
      </a>

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
        <p
          v-if="accountChecking"
          class="form-note muted"
        >
          Checking your networked.art account…
        </p>
        <p
          v-else
          class="form-note muted"
        >
          This Punk isn't listed for sale, but Canon can help you reach the
          owner or find a similar one. Leave your details below and we'll follow
          up by email or Twitter.
        </p>

        <form
          class="inquire-form"
          @submit.prevent="submit"
        >
          <label
            v-if="needsEmail"
            class="field"
          >
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
          <label class="field">
            <span class="label">Twitter (optional)</span>
            <input
              v-model.trim="twitter"
              type="text"
              name="twitter"
              autocomplete="off"
              placeholder="@handle"
            />
          </label>
          <label class="field">
            <span class="label">Note (optional)</span>
            <textarea
              v-model.trim="note"
              name="note"
              rows="3"
              maxlength="1000"
              placeholder="What are you looking to do — reach the owner, find a similar Punk?"
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
        <template v-if="submittedWithAccount">
          Your inquiry is in. Canon will follow up by email or Twitter.
        </template>
        <template v-else>
          Check your inbox! We sent a confirmation link to
          <strong>{{ email }}</strong
          >. Confirm it and Canon will follow up.
        </template>
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
            :disabled="pending || accountChecking"
            @click="submit"
          >
            {{ submitLabel }}
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
import { useConnection } from '@wagmi/vue'
import type { Address } from 'viem'
import { CRYPTOPUNKS_ADDRESS } from '~/utils/addresses'
import { postApi } from '~/utils/api'

const props = defineProps<{
  punkId: number
}>()

const route = useRoute()
const router = useRouter()
const { address } = useConnection()
const na = useNetworkedArt()

onMounted(() => {
  if (!na.ready.value && !na.pending.value) void na.refresh()
})

// Mirror the inquiry modal in the URL so an open dialog is linkable. The query
// is the source of truth on load; opening or closing writes it back.
const open = ref(route.query.inquire === 'open')

watch(open, (isOpen) => {
  if ((route.query.inquire === 'open') === isOpen) return
  const { inquire: _omit, ...rest } = route.query
  router.replace({ query: isOpen ? { ...rest, inquire: 'open' } : rest })
})

watch(
  () => route.query.inquire,
  (value) => {
    open.value = value === 'open'
  },
)

// Owner's wallet last-active, sourced from the indexer's tx-from tracking, so
// Canon can gauge how reachable the holder is. Held back until the dialog is
// open so merely viewing a Punk detail page doesn't trigger the lookup — the
// stats only surface inside the dialog. Custody set covers vault/stash; the EOA
// drives the last-active lookup.
const { owner: resolvedOwner, nativeOwner } = usePunkDetailDataContext()
const ownerAddresses = computed<Address[]>(() => {
  if (!open.value) return []
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
const twitter = ref('')
const note = ref('')
const error = ref<string | null>(null)
const pending = ref(false)
const submitted = ref(false)
const submittedWithAccount = ref(false)
const usesConnectedAccount = computed(() => na.isAuthenticated.value)
const accountChecking = computed(() => !!na.token.value && !na.ready.value)
const needsEmail = computed(
  () => !usesConnectedAccount.value && !accountChecking.value,
)
const submitLabel = computed(() => {
  if (pending.value) return 'Sending…'
  if (accountChecking.value) return 'Checking…'
  return 'Send inquiry'
})

// Loose RFC-pragmatic check — good enough to catch typos before handoff.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The API stores the bare X username; strip @-prefixes and profile URLs so a
// pasted link still validates.
function normalizedTwitter() {
  const handle = twitter.value
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/, 1)[0]!
  if (!handle) return null
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return false
  return handle
}

async function submit() {
  if (pending.value) return
  if (accountChecking.value) return

  const useAccount = usesConnectedAccount.value

  if (!useAccount && !EMAIL_RE.test(email.value)) {
    error.value = 'Enter a valid email address.'
    return
  }
  const userTwitter = normalizedTwitter()
  if (userTwitter === false) {
    error.value = 'Enter a valid Twitter handle.'
    return
  }
  error.value = null
  pending.value = true
  try {
    // Guest confirmation links land the buyer back on this app once confirmed;
    // authenticated requests keep the same context if the API needs it.
    const redirectUrl = new URL(
      `/brokerage/confirmed?punk=${props.punkId}`,
      'https://punks.auction',
    ).toString()
    const body = {
      ...(!useAccount ? { email: email.value } : {}),
      source: 'punks_auctions',
      user_address: address.value ?? null,
      user_twitter: userTwitter,
      redirect_url: redirectUrl,
      user_note: note.value || null,
      scope: {
        // The header (and so this form) only offers inquiries for canonical
        // CryptoPunks.
        contract_address: CRYPTOPUNKS_ADDRESS,
        token_id: String(props.punkId),
        search: null,
      },
    }
    if (useAccount) {
      await na.api('/brokerage/requests', { method: 'POST', body })
    } else {
      await postApi('/brokerage/requests', body)
    }
    submittedWithAccount.value = useAccount
    submitted.value = true
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    pending.value = false
  }
}

function reset() {
  email.value = ''
  twitter.value = ''
  note.value = ''
  error.value = null
  pending.value = false
  submitted.value = false
  submittedWithAccount.value = false
}
</script>

<style scoped>
.inquire {
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

.inquire-form {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--size-1);
}

.field .label {
  color: var(--text-dim);
}

.field input,
.field textarea {
  width: 100%;
}

.field textarea {
  resize: vertical;
  min-height: var(--size-8);
  font: inherit;
}

.error {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--accent);
}

.canon-credit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--size-2);
  border: 0;
  font-size: var(--font-xs);
  width: fit-content;
  width: 100%;
  margin-inline: auto;
  padding: var(--size-3) var(--size-4) var(--size-6);
  border-bottom: var(--border);
}

.canon-logo {
  height: 0.75rem;
  width: auto;
  display: block;
}

.inquire-dialog :deep(section) {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}
</style>
