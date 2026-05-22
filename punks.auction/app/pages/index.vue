<template>
  <div class="landing">
    <h1 class="headline">
      An Auction House &amp; Marketplace
      <span class="headline-em">for CryptoPunks</span>
    </h1>
  </div>
</template>

<script setup lang="ts">
const PAGE_TITLE = 'Punks Auction — An Auction House for CryptoPunks'
useSeoMeta({
  title: PAGE_TITLE,
  ogTitle: PAGE_TITLE,
  twitterTitle: PAGE_TITLE,
})
</script>

<style scoped>
.landing {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--size-9) var(--size-4);
  min-height: 60vh;
  max-height: 100vh;
  text-align: center;
}

.headline {
  margin: 0;
  max-width: 600px;
  font-size: clamp(30px, 6vw, 46px);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.12;
}

.headline-em {
  color: var(--accent-strong);
}
</style>
