<template>
  <div class="landing">
    <HeroPunks />
    <h1 class="headline">
      An Auction House
      <span class="headline-em">for CryptoPunks</span>
    </h1>
    <p class="subline">
      24-hour auctions. Zero fees. Real price discovery.
    </p>
    <div class="cta-buttons">
      <NuxtLink to="/punks" class="btn btn-primary">Browse Punks</NuxtLink>
      <NuxtLink to="/about" class="btn btn-secondary">Learn More</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const PAGE_TITLE = 'Punks Auction — An Auction House for CryptoPunks'
useSeoMeta({
  title: PAGE_TITLE,
  ogTitle: PAGE_TITLE,
  twitterTitle: PAGE_TITLE,
})
// defineOgImage('Default', {
//   title: 'An Auction House for CryptoPunks',
//   description: '24h auctions, multi-Punk lots, native-ETH purchase offers.',
// })
</script>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--size-8);
  padding: var(--size-9) var(--size-4);
  min-height: calc(100svh - 113px);
  text-align: center;
}

.headline {
  margin: var(--size-4) 0 0;
  max-width: 600px;
  font-size: var(--font-display);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tighter);
  line-height: var(--line-height-tight);
}

.headline-em {
  color: var(--accent);
}

.subline {
  margin: 0;
  max-width: 560px;
  color: var(--text-muted);
  font-size: var(--font-display-sm);
  line-height: var(--line-height-relaxed);
}

.cta-buttons {
  display: flex;
  gap: var(--size-3);
  margin-top: var(--size-2);
}

.btn {
  padding: var(--size-3) var(--size-5);
  font-size: var(--font-base);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--accent-strong);
  color: var(--bg);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  color: var(--text);
  border-color: var(--text-muted);
}
</style>
