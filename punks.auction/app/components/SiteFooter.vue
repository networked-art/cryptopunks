<template>
  <footer class="site-footer">
    <nav
      class="footer-nav"
      aria-label="Footer"
    >
      <NuxtLink
        to="/terms"
        active-class="nav-active"
        >Terms</NuxtLink
      >
      <a
        href="https://networked.art"
        target="_blank"
        rel="noopener noreferrer"
        >networked.art</a
      >
      <a
        href="https://github.com/networked-art/cryptopunks/tree/master/punks.auction"
        target="_blank"
        rel="noopener noreferrer"
        >GitHub</a
      >
    </nav>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.footer-nav {
  min-height: 48px;
  padding: 0 var(--size-4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--size-4);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0;
}

.footer-nav a {
  color: var(--text-muted);
  border: 0;
  padding: 4px 0;
  text-decoration: none;
}

.footer-nav a:hover,
.nav-active {
  color: var(--text);
}

@media (max-width: 640px) {
  .site-footer {
    padding-block-end: var(--bottom-nav-height);
  }

  .footer-nav {
    min-height: 56px;
  }
}
</style>
