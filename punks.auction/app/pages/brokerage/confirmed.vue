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
        <h1>Request confirmed</h1>
        <p class="muted">
          Thanks for confirming your email. A broker may reach out about
          <template v-if="punkId !== null">Punk #{{ punkId }}</template>
          <template v-else>your request</template>
          if there's a match. A response isn't guaranteed.
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
// The buyer lands here after clicking the confirmation link in their email —
// the API confirms the request, then redirects back with `?punk` so we can
// name the Punk they asked about.
const route = useRoute()
const punkId = computed(() => {
  const raw = route.query.punk
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return id >= 0 && id <= 9999 ? id : null
})

useSeoMeta({
  title: 'Request confirmed · Punks Auction',
  ogTitle: 'Request confirmed · Punks Auction',
  twitterTitle: 'Request confirmed · Punks Auction',
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
