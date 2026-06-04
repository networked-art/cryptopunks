<template>
  <div class="container confirm-page">
    <section class="confirm-card">
      <PunkThumb
        v-if="punkId !== null"
        class="confirm-thumb"
        :punk-id="punkId"
        :size="80"
        :link="false"
      />

      <div class="confirm-text">
        <h1>Alert confirmed</h1>
        <p class="muted">
          Thanks for confirming your email. We'll email you about market
          activity for
          <template v-if="punkId !== null">Punk #{{ punkId }}</template>
          <template v-else-if="label">“{{ label }}”</template>
          <template v-else>the Punks you're watching</template>. Every email
          includes a one-click unsubscribe.
        </p>
      </div>

      <Button
        v-if="punkId !== null"
        class="primary"
        :to="`/punks/${punkId}`"
      >
        Back to Punk #{{ punkId }}
      </Button>
      <Button
        v-else
        class="primary"
        to="/punks"
      >
        Browse Punks
      </Button>
    </section>
  </div>
</template>

<script setup lang="ts">
// The visitor lands here after clicking the confirmation link in their email —
// the API confirms the subscription, then redirects back with the context we
// asked it to preserve: `?punk` for a single-Punk watch (WatchStar) or `?label`
// for a saved-search alert (SearchAlert).
const route = useRoute()

const punkId = computed(() => {
  const raw = route.query.punk
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return id >= 0 && id <= 9999 ? id : null
})

const label = computed(() => {
  const raw = route.query.label
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // The label is rendered as text, never markup; cap its length so an absurd
  // query can't blow out the card.
  return trimmed.slice(0, 80)
})

useSeoMeta({
  title: 'Alert confirmed · Punks Auction',
  ogTitle: 'Alert confirmed · Punks Auction',
  twitterTitle: 'Alert confirmed · Punks Auction',
  robots: 'noindex',
})
</script>

<style scoped>
.confirm-page {
  display: grid;
  place-items: center;
  min-height: 70vh;
  padding: var(--size-8) var(--size-4);
}

.confirm-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-5);
  max-width: 420px;
  padding: var(--size-7) var(--size-6);
  border: var(--border);
  background: var(--bg-elevated);
  text-align: center;
}

.confirm-thumb {
  flex-shrink: 0;
}

.confirm-text {
  display: flex;
  flex-direction: column;
  gap: var(--size-2);
}

.confirm-text h1 {
  margin: 0;
  font-size: var(--font-display-sm);
}

.confirm-text p {
  margin: 0;
  line-height: var(--line-height-loose);
}
</style>
