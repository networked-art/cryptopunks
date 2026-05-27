<template>
  <div class="landing">
    <HeroPunks />
    <h1 class="headline">
      An Auction House
      <span class="headline-em">for CryptoPunks</span>
    </h1>
    <p class="subline">
      Open source marketplace with 24h auctions on CryptoPunks lots
    </p>
  </div>
</template>

<script setup lang="ts">
const PAGE_TITLE = 'Punks Auction — An Auction House for CryptoPunks'
useSeoMeta({
  title: PAGE_TITLE,
  ogTitle: PAGE_TITLE,
  twitterTitle: PAGE_TITLE,
})
defineOgImage('Default', {
  title: 'An Auction House for CryptoPunks',
  description: '24h auctions, multi-Punk lots, native-ETH purchase offers.',
})
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
  color: var(--accent-strong);
}

.subline {
  margin: 0;
  max-width: 560px;
  color: var(--text-muted);
  font-size: var(--font-display-sm);
  line-height: var(--line-height-relaxed);
}
</style>
