<template>
  <div class="shell">
    <NuxtLoadingIndicator color="var(--primary)" />
    <SiteHeader />
    <main class="shell-main">
      <NuxtPage />
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
