<template>
  <footer class="site-footer">
    <div class="footer-inner">
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
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.footer-inner {
  min-height: 48px;
  padding: 0 var(--size-4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--size-4);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
}

.footer-inner a {
  color: inherit;
  border: 0;
  text-decoration: none;
}

.footer-inner a:hover {
  color: var(--accent);
}

@media (max-width: 640px) {
  .site-footer {
    padding-block-end: var(--bottom-nav-height);
  }

  .footer-inner {
    min-height: 56px;
  }
}
</style>
