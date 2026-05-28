<template>
  <div class="landing">
    <HeroPunks />
    <h1
      class="headline"
      aria-label="An Auction House for CryptoPunks"
    >
      <Wordmark />
    </h1>
    <p class="subline">
      24-hour auctions. Zero fees. Real price discovery.
    </p>
    <div class="cta-buttons">
      <Button
        class="primary large"
        to="/punks"
      >
        Browse Punks
      </Button>
      <Button
        class="large"
        to="/about"
      >
        Learn More
      </Button>
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
  width: 600px;
  max-width: 100%;
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
</style>
