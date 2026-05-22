<template>
  <header class="site-header">
    <div class="container header-inner">
      <NuxtLink
        to="/"
        class="brand"
      >
        <span class="brand-word">Punks Auction</span>
      </NuxtLink>

      <nav class="nav">
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

.brand-word {
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
