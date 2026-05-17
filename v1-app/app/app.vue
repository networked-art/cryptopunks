<template>
  <div class="shell">
    <NuxtLoadingIndicator color="#e94560" />
    <SiteHeader />
    <main class="shell-main">
      <NuxtPage />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-block-size: 100dvh;
  display: flex;
  flex-direction: column;
  font-family: var(--font-mono);
}

.shell-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
