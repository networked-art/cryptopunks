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
          href="https://github.com/networked-art/cryptopunks"
          target="_blank"
        >
          Github
        </a>
        <a
          href="https://x.com/punksauctions"
          target="_blank"
          rel="noopener noreferrer"
        >
          X
        </a>
      </div>
      <div class="footer-links footer-links-right">
        <NuxtLink
          to="/about"
          active-class="nav-active"
          >About</NuxtLink
        >
        <NuxtLink
          to="/terms"
          active-class="nav-active"
          >Terms</NuxtLink
        >
      </div>
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
    margin-block-end: var(--bottom-nav-height);
    background: var(--background);
    color: var(--text-dim);
  }

  .footer-nav {
    min-height: 56px;
  }

  .footer-nav a,
  .footer-nav .nav-active {
    color: var(--text-dim);
  }

  .footer-nav a:hover {
    color: var(--text-muted);
  }
}
</style>
