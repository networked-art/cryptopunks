<template>
  <nav
    class="profile-tabs"
    aria-label="Profile sections"
  >
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.slug"
      :to="tab.to"
      class="tab"
      :exact-active-class="tab.slug === '' ? 'active' : ''"
      :active-class="tab.slug === '' ? '' : 'active'"
    >
      <Icon
        :name="tab.icon"
        class="tab-icon"
      />
      <span>{{ tab.label }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** Already-resolved handle (EOA or ENS) the parent profile is showing. */
  handle: string
}>()

const tabs = computed(() => {
  const base = `/profile/${props.handle}`
  return [
    { slug: '', label: 'Profile', icon: 'lucide:user', to: base },
    {
      slug: 'vault',
      label: 'Vault management',
      icon: 'lucide:shield-check',
      to: `${base}/vault`,
    },
    {
      slug: 'offers',
      label: 'Active offers',
      icon: 'lucide:tag',
      to: `${base}/offers`,
    },
    {
      slug: 'wrappers',
      label: 'Wrappers',
      icon: 'lucide:layers',
      to: `${base}/wrappers`,
    },
  ]
})
</script>

<style scoped>
.profile-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-1);
  border-bottom: var(--border);
  margin-bottom: var(--size-2);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  padding: var(--size-2) var(--size-3);
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  font-size: var(--font-sm);
  margin-bottom: -1px;
  white-space: nowrap;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.tab-icon {
  font-size: var(--font-md);
}

@media (max-width: 520px) {
  .tab span {
    display: none;
  }

  .tab {
    padding: var(--size-2);
  }
}
</style>
