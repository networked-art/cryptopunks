<template>
  <div class="container terms-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>Terms</h1>
        <p class="muted">Use Punks Auction at your own risk.</p>
      </div>
    </header>

    <section class="terms-section">
      <h2 class="section-title eyebrow">No responsibility for losses</h2>
      <p>
        We do not take responsibility for any loss of funds, CryptoPunks, ETH,
        tokens, gas fees, transaction costs, market value, or other assets that
        may result from using this app, the related smart contracts, wallets,
        RPC providers, block explorers, or any other connected service.
      </p>
    </section>

    <section class="terms-section">
      <h2 class="section-title eyebrow">Blockchain risk</h2>
      <p>
        Blockchain transactions are irreversible. You are responsible for
        reviewing every transaction, address, approval, bid, offer, lot, and
        settlement before signing. Bugs, network failures, contract behavior,
        wallet compromise, user error, and third-party service issues may cause
        permanent loss.
      </p>
    </section>

    <section class="terms-section">
      <h2 class="section-title eyebrow">No warranty</h2>
      <p>
        The app is provided as-is, without warranties of any kind. We do not
        guarantee that the app, data, interfaces, contracts, or third-party
        integrations will be available, accurate, secure, or error-free.
      </p>
    </section>

    <section class="terms-section">
      <h2 class="section-title eyebrow">No financial advice</h2>
      <p>
        Nothing in this app is financial, investment, tax, or legal advice. You
        are responsible for your own decisions and for complying with laws that
        apply to you.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Terms · Punks Auction',
  ogTitle: 'Terms · Punks Auction',
  twitterTitle: 'Terms · Punks Auction',
})
</script>

<style scoped>
.terms-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
  max-width: 720px;
}

.terms-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.terms-section p {
  margin: 0;
  line-height: var(--line-height-loose);
}
</style>
