<template>
  <header
    ref="headerEl"
    class="site-header"
  >
    <div class="header-inner">
      <NuxtLink
        to="/"
        class="brand"
        aria-label="Punks Auction"
      >
        <Logo class="brand-mark" />
      </NuxtLink>

      <nav
        class="nav app-nav"
        @mouseleave="hoveredIndex = null"
      >
        <NuxtLink
          v-for="(item, i) in navItems"
          :key="item.to"
          :ref="(el) => setNavLinkRef(el, i)"
          :to="item.to"
          active-class="nav-active"
          @mouseenter="hoveredIndex = i"
          >{{ item.label }}</NuxtLink
        >
      </nav>

      <ClientOnly>
        <div class="connect">
          <EvmConnectDialog
            v-if="!isConnected"
            class-name="primary"
          >
            Connect
          </EvmConnectDialog>
          <NuxtLink
            v-else-if="address && profileHandle"
            :to="`/profile/${profileHandle}`"
            class="profile-link"
            aria-label="View your profile"
          >
            <Account :address="address" />
          </NuxtLink>
        </div>
      </ClientOnly>
    </div>

    <span
      class="nav-indicator"
      :class="{ visible: indicator.visible, animate: indicator.animate }"
      :style="{
        transform: `translateX(${indicator.left}px)`,
        width: `${indicator.width}px`,
      }"
      aria-hidden="true"
    />
  </header>
</template>

<script setup lang="ts">
import { useConnection } from '@wagmi/vue'

const { isConnected, address } = useConnection()

const ensProfile = useEnsWithAvatar(() => address.value)
const profileHandle = computed(
  () => ensProfile.data.value?.ens ?? address.value ?? null,
)

const navItems = [
  { to: '/punks', label: 'Punks' },
  { to: '/auctions', label: 'Auctions' },
  { to: '/purchase-offers', label: 'Offers' },
  { to: '/activity', label: 'Activity' },
]

const route = useRoute()
const headerEl = ref<HTMLElement | null>(null)
const navLinkEls = ref<(HTMLElement | null)[]>([])
const setNavLinkRef = (el: unknown, i: number) => {
  const node = (el as { $el?: HTMLElement } | HTMLElement | null) ?? null
  navLinkEls.value[i] =
    node && '$el' in (node as object)
      ? ((node as { $el: HTMLElement }).$el ?? null)
      : ((node as HTMLElement | null) ?? null)
}

const hoveredIndex = ref<number | null>(null)
const activeIndex = computed(() => {
  const path = route.path
  return navItems.findIndex(
    (item) => path === item.to || path.startsWith(`${item.to}/`),
  )
})
const targetIndex = computed<number | null>(() => {
  if (hoveredIndex.value !== null) return hoveredIndex.value
  return activeIndex.value >= 0 ? activeIndex.value : null
})

const indicator = reactive({
  left: 0,
  width: 0,
  visible: false,
  animate: false,
})

const updateIndicator = () => {
  const i = targetIndex.value
  const header = headerEl.value
  const link = i !== null ? navLinkEls.value[i] : null
  if (i === null || !header || !link) {
    indicator.visible = false
    return
  }
  const linkRect = link.getBoundingClientRect()
  const headerRect = header.getBoundingClientRect()
  const wasVisible = indicator.visible
  indicator.left = linkRect.left - headerRect.left
  indicator.width = linkRect.width
  if (!wasVisible) {
    indicator.animate = false
    indicator.visible = true
    nextTick(() => {
      indicator.animate = true
    })
  } else {
    indicator.visible = true
    indicator.animate = true
  }
}

watch(targetIndex, () => nextTick(updateIndicator))
onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', updateIndicator)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIndicator)
})
</script>

<style scoped>
.site-header {
  border-bottom: var(--border);
  background: var(--bg-elevated);
  position: sticky;
  top: 0;
  z-index: calc(var(--z-index-ui) + 1);
  backdrop-filter: blur(8px);
}

.header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--size-6);
  height: 56px;
  padding: 0 var(--size-4);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--size-2);
  font-weight: var(--font-weight-bolder);
  border: 0;
  color: var(--text);
  justify-self: start;
  padding-inline: var(--size-1);
}

.brand-mark {
  color: var(--accent);
  flex-shrink: 0;
}

.brand:hover {
  color: var(--accent);
}

.brand-word {
  letter-spacing: var(--letter-spacing-tight);
}

@media (max-width: 640px) {
  .header-inner {
    grid-template-columns: 1fr 1fr;
  }

  .nav {
    display: none;
  }
}

.nav-indicator {
  position: absolute;
  left: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  transform: translateX(0);
  will-change: transform, width;
}

.nav-indicator.visible {
  opacity: 1;
}

.nav-indicator.animate {
  transition:
    transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
    width 220ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 120ms ease;
}

.connect {
  display: flex;
  align-items: center;
  gap: var(--size-3);
  justify-self: end;
}

.profile-link {
  display: inline-flex;
  align-items: center;
  border: 0;
  color: var(--text);
}

.profile-link:hover {
  color: var(--accent);
}
</style>
