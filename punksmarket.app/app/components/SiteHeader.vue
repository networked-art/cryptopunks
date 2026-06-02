<template>
  <header class="site-header">
    <div class="container header-inner">
      <NuxtLink
        to="/"
        class="brand"
      >
        <span class="brand-word">C̩ͤ̊̄ͦͅry̸̢̯̍ͨ́̍p̛̞̘̊ͪ̕t̝o̩͗̈́͜P̹̗u̗ͬnḳ͚̫̋sMarket</span>
      </NuxtLink>

      <nav class="nav">
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
        <!-- <NuxtLink -->
        <!--   to="/pairs" -->
        <!--   active-class="nav-active" -->
        <!--   >Pairs</NuxtLink -->
        <!-- > -->
        <NuxtLink
          to="/about"
          active-class="nav-active"
          >About</NuxtLink
        >
      </nav>

      <ClientOnly>
        <div class="connect">
          <EvmConnectDialog v-if="!isConnected" />
          <EvmProfile
            v-else
            class-name="unstyled profile-trigger"
          >
            <template #default="{ address }">
              <AccountBadge
                v-if="address"
                :address="address"
              />
            </template>
            <template #actions="{ ens, address }">
              <Button
                v-if="address"
                class="block"
                @click="viewProfile(ens || address)"
              >
                <Icon name="home" />
                <span>View Profile</span>
              </Button>
            </template>
          </EvmProfile>
        </div>
      </ClientOnly>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'

const { isConnected } = useConnection()

const viewProfile = (id: string) => {
  const dialog = document.querySelector('.dialog.evm-profile.open')
  if (dialog?.nextElementSibling?.classList.contains('overlay')) {
    ;(dialog.nextElementSibling as HTMLElement).click()
  }
  navigateTo(`/profile/${id}`)
}
</script>

<style scoped>
.site-header {
  border-bottom: var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: calc(var(--z-index-ui) + 1);
  backdrop-filter: blur(8px);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: var(--size-6);
  height: 56px;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--size-2);
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
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  gap: var(--size-4);
  margin-right: auto;
  font-size: 13px;
}

@media (max-width: 640px) {
  .nav {
    display: none;
  }

  .brand {
    margin-right: auto;
  }
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
  gap: var(--size-3);
}

.connect :deep(.profile-trigger) {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
</style>
