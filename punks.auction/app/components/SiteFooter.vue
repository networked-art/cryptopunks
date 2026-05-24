<template>
  <footer class="site-footer">
    <nav
      class="footer-nav app-nav"
      aria-label="Footer"
    >
      <div class="footer-links">
        <a
          href="https://networked.art"
          target="_blank"
          rel="noopener noreferrer"
          >networked.art</a
        >
        <a
          href="https://github.com/networked-art/cryptopunks/tree/master/punks.auction"
          target="_blank"
        >
          Github
        </a>
      </div>
      <NuxtLink
        to="/terms"
        active-class="nav-active"
        >Terms</NuxtLink
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
  justify-content: space-between;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: var(--size-4);
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
