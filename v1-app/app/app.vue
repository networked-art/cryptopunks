<template>
  <div class="shell">
    <NuxtLoadingIndicator color="#e94560" />
    <SiteHeader />
    <main class="shell-main">
      <NuxtPage />
    </main>
    <BottomNav class="mobile-nav">
      <NuxtLink
        to="/"
        active-class="nav-active"
        exact-active-class="nav-active"
        >Search</NuxtLink
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
