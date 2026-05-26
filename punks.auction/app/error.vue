<template>
  <div class="shell">
    <SiteHeader />
    <main class="shell-main">
      <div class="error-page">
        <PunkThumb
          :punk-id="punkId"
          :size="144"
          :link="false"
          class="error-punk"
        />
        <h1 class="headline">
          <span class="headline-em">{{ statusCode }} {{ headlineSuffix }}</span>
        </h1>
        <p class="subline">{{ subline }}</p>
        <div class="error-actions">
          <Button
            class="primary"
            @click="goHome"
          >
            Back to the auction house
          </Button>
        </div>
      </div>
    </main>
    <SiteFooter />
    <BottomNav class="mobile-nav app-nav">
      <NuxtLink
        to="/punks"
        active-class="nav-active"
        >Punks</NuxtLink
      >
      <NuxtLink
        to="/auctions"
        active-class="nav-active"
        >Auctions</NuxtLink
      >
      <NuxtLink
        to="/purchase-offers"
        active-class="nav-active"
        >Offers</NuxtLink
      >
      <NuxtLink
        to="/activity"
        active-class="nav-active"
        >Activity</NuxtLink
      >
    </BottomNav>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const PUNK_SUPPLY = 10_000

const props = defineProps<{ error: NuxtError }>()

const statusCode = computed(() => props.error?.statusCode ?? 500)
const isNotFound = computed(() => statusCode.value === 404)

const headlineSuffix = computed(() =>
  isNotFound.value ? 'Not found' : 'Something broke',
)

const subline = computed(() => {
  if (isNotFound.value) {
    return `We couldn't find anything at this URL.`
  }
  return (
    props.error?.message ||
    props.error?.statusMessage ||
    'An unexpected error stopped the page from loading. Try again in a moment.'
  )
})

const punkId = computed(() =>
  isNotFound.value ? 404 : Math.floor(Math.random() * PUNK_SUPPLY),
)

useSeoMeta({
  title: () => `${statusCode.value} · Punks Auction`,
})

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<style scoped>
.shell {
  min-block-size: 100dvh;
  display: flex;
  flex-direction: column;
  font-family: var(--font-mono);
}

.shell-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--size-6);
  padding: var(--size-9) var(--size-4);
  min-height: calc(100svh - 113px);
  text-align: center;
}

.error-punk {
  image-rendering: pixelated;
}

.headline {
  margin: var(--size-2) 0 0;
  max-width: 600px;
  font-size: var(--font-display);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tighter);
  line-height: var(--line-height-tight);
}

.headline-em {
  display: block;
  color: var(--accent-strong);
}

.subline {
  margin: 0;
  max-width: 520px;
  color: var(--text-muted);
  font-size: var(--font-display-sm);
  line-height: var(--line-height-relaxed);
}

.error-actions {
  display: flex;
  gap: var(--size-3);
  flex-wrap: wrap;
  justify-content: center;
}

.mobile-nav {
  display: none;
  backdrop-filter: none;
  background: var(--bg-elevated);
}

@media (max-width: 640px) {
  .mobile-nav {
    display: flex;
  }

  .shell-main {
    padding-block-end: var(--bottom-nav-height);
  }
}
</style>
