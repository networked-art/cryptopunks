<template>
  <div class="shell">
    <SiteHeader />
    <main class="shell-main">
      <div class="container error-page">
        <PunkImage
          :punk-id="punkId"
          :size="160"
          glitch="always"
          background="classic"
          class="error-punk"
        />
        <header class="page-head">
          <h1>{{ statusCode }} · {{ headline }}</h1>
          <p class="muted">{{ subline }}</p>
        </header>
        <div class="error-actions">
          <Button
            class="primary"
            @click="goHome"
          >
            Back to search
          </Button>
        </div>
      </div>
    </main>
    <BottomNav class="mobile-nav">
      <NuxtLink
        to="/"
        active-class="nav-active"
        exact-active-class="nav-active"
        >Search</NuxtLink
      >
      <NuxtLink
        to="/listings"
        active-class="nav-active"
        >Listings</NuxtLink
      >
      <NuxtLink
        to="/bids"
        active-class="nav-active"
        >Bids</NuxtLink
      >
      <NuxtLink
        to="/activity"
        active-class="nav-active"
        >Activity</NuxtLink
      >
      <NuxtLink
        to="/about"
        active-class="nav-active"
        >About</NuxtLink
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

const headline = computed(() =>
  isNotFound.value ? 'Page not found' : 'Something glitched',
)

const subline = computed(() => {
  if (isNotFound.value) {
    return 'There is no punk, listing, or bid at this URL.'
  }
  return (
    props.error?.message ||
    props.error?.statusMessage ||
    'An unexpected error stopped the page from loading.'
  )
})

const punkId = computed(() =>
  isNotFound.value ? 404 : Math.floor(Math.random() * PUNK_SUPPLY),
)

useSeoMeta({
  title: () => `${statusCode.value} · punksmarket.app`,
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
  gap: var(--size-5);
  padding: var(--size-9) var(--size-4);
  flex: 1;
  text-align: center;
}

.error-punk {
  --radius-sm: 0;
}

.page-head h1 {
  margin: 0 0 var(--size-2);
}

.page-head .muted {
  margin: 0;
  max-width: 460px;
  line-height: 1.55;
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
  background: var(--background);
}

.mobile-nav :deep(a) {
  font-size: 13px;
}

.mobile-nav :deep(.nav-active) {
  color: var(--text);
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
