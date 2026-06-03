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
      <p
        v-if="branded"
        class="brand-attribution"
      >
        <span class="brand-label">Service provided by</span>
        <PunkDetailMarketBrokerLogo class="brand-logo" />
      </p>

      <template v-if="!submitted">
        <p class="form-note muted">
          Interested in Punk #{{ punkId }}? Leave your email and {{ brokerName }}
          may reach out to discuss placing a bid or arranging a private sale.
          Submitting this doesn’t guarantee a response or a placement.
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

    <Teleport to="body">
      <button
        v-if="open"
        type="button"
        class="brand-toggle"
        :style="toggleStyle"
        @click="branded = !branded"
      >
        {{ branded ? 'View standard version' : 'View broker-branded version' }}
      </button>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

defineProps<{
  punkId: number
}>()

const open = ref(false)
const email = ref('')
const error = ref<string | null>(null)
const submitted = ref(false)
// Demo affordance: flips the dialog to a co-branded broker preview. Persists
// across reopen so it can be shown/screen-shared without re-toggling.
const branded = ref(false)
// Named broker (from runtime config) in the branded preview; generic in the
// standard version.
const broker = useRuntimeConfig().public.broker as { name: string; logo: string }
const brokerName = computed(() => (branded.value ? broker.name : 'a broker'))

// Float the version toggle just below the dialog box: present only while the
// popover is open and anchored to the live dialog rect, so it reads as a
// detached control — not page chrome, not part of the dialog's own UI.
const dialogRect = ref<{ left: number; bottom: number; width: number } | null>(
  null,
)

function measureDialog() {
  if (!import.meta.client) return
  const el = document.querySelector('.broker-dialog') as HTMLElement | null
  if (!el) {
    dialogRect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  dialogRect.value = { left: r.left, bottom: r.bottom, width: r.width }
}

const toggleStyle = computed(() => {
  const r = dialogRect.value
  if (!r) return { display: 'none' }
  return {
    position: 'fixed',
    top: `${r.bottom + 12}px`,
    left: `${r.left + r.width / 2}px`,
    transform: 'translateX(-50%)',
  }
})

// Re-anchor whenever the dialog opens or its height changes (branded banner,
// success state, validation error all reflow it).
watch([open, branded, submitted, error], async () => {
  if (!open.value) {
    dialogRect.value = null
    return
  }
  await nextTick()
  measureDialog()
  requestAnimationFrame(measureDialog)
})

if (import.meta.client) {
  useEventListener('resize', measureDialog)
}

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

.brand-attribution {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--size-2);
  margin: 0;
  padding-bottom: var(--size-3);
  border-bottom: var(--border);
}

.brand-label {
  font-size: var(--font-xs);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.brand-logo {
  height: 0.875rem;
  color: var(--text, #030301);
}

.brand-toggle {
  z-index: 2147483000;
  padding: 0;
  background: none;
  border: 0;
  color: var(--text-dim);
  font: inherit;
  font-size: var(--font-xs);
  white-space: nowrap;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  box-shadow: none;
  opacity: 0.85;
  transition: opacity 120ms ease;
}

.brand-toggle:hover,
.brand-toggle:active,
.brand-toggle:focus,
.brand-toggle:focus-visible {
  outline: none;
  box-shadow: none;
}

.brand-toggle:hover,
.brand-toggle:focus-visible {
  opacity: 1;
}
</style>
