<template>
  <header class="site-header">
    <div class="container header-inner">
      <NuxtLink
        to="/"
        class="brand"
      >
        <span class="brand-mark">▒▓</span>
        <span class="brand-word">punksmarket</span>
      </NuxtLink>

      <nav class="nav">
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
      </nav>

      <ClientOnly>
        <div class="connect">
          <EvmConnectDialog>
            <template #connected="{ address }">
              <NuxtLink
                v-if="address"
                :to="`/profile/${address}`"
                class="profile-link"
              >
                <AccountBadge :address="address" />
              </NuxtLink>
            </template>
          </EvmConnectDialog>
        </div>
      </ClientOnly>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 30;
  backdrop-filter: blur(8px);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  height: 56px;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  border: 0;
  color: var(--text);
}

.brand:hover {
  color: var(--accent);
}

.brand-mark {
  color: var(--accent);
  letter-spacing: -0.05em;
}

.brand-word {
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  gap: var(--space-4);
  margin-right: auto;
  font-size: 13px;
}

.nav a {
  border: 0;
  color: var(--text-muted);
  padding: 4px 0;
}

.nav a:hover,
.nav-active {
  color: var(--text);
}

.nav-active {
  box-shadow: inset 0 -2px 0 var(--accent);
}

.connect {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.profile-link {
  border: 0;
}
</style>
