<template>
  <div class="container new-lot-page">
    <header class="page-head">
      <div class="page-head-text">
        <NuxtLink
          class="back-link muted"
          to="/auctions"
        >
          <Icon name="lucide:arrow-left" />
          <span>Auctions</span>
        </NuxtLink>
        <h1>Create lot</h1>
        <p class="muted">
          Pick up to 80 of your CryptoPunks. Any Punk that isn't vaulted yet
          will be moved into your auction vault before the lot is created.
        </p>
      </div>
    </header>

    <LazyLotCreateForm />
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Create lot · Punks Auction',
  ogTitle: 'Create lot · Punks Auction',
  twitterTitle: 'Create lot · Punks Auction',
})
</script>

<style scoped>
.new-lot-page {
  max-width: 720px;
  padding: var(--size-8) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-5);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--size-1);
  align-self: flex-start;
  border: 0;
  font-size: var(--font-sm);
}
</style>
