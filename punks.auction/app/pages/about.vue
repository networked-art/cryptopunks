<template>
  <div class="container about-page">
    <header class="page-head">
      <h1>About</h1>
      <p class="muted">
        An open-source auction house on the world computer, for CryptoPunks.
      </p>
    </header>

    <section class="about-section">
      <p>
        <code>PunksAuction</code> is an ownerless smart contract that runs
        24-hour auctions and native-ETH purchase offers for
        <a
          href="https://evm.now/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"
          target="_blank"
          rel="noopener"
          >CryptoPunks</a
        >. It charges no fees — every wei a bidder pays reaches the seller.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title eyebrow">Vaults</h2>
      <p>
        A seller never hands custody to the auction house. Each seller keeps
        their Punks in their own <code>PunksVault</code>, deployed
        deterministically through the <code>PunksVaultFactory</code>, and
        approves <code>PunksAuction</code> as an operator. The auction pulls a
        Punk out of the vault only at the moment a sale starts, into a dedicated
        <code>PunksAuctionEscrow</code>, and settles from there.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title eyebrow">Lots and auctions</h2>
      <p>
        A seller bundles one or more vaulted Punks into a <em>lot</em> with a
        reserve price. A lot just sits there — it costs nothing and is not yet
        an auction. Anyone can then place the opening bid: the first bid at or
        above the reserve pulls the Punks into escrow and starts a 24-hour
        auction.
      </p>
      <p>
        Each later bid must beat the standing bid by at least 10%. A bid in the
        final 15 minutes extends the auction so it always ends with 15 minutes
        of quiet. Once the clock runs out, anyone can settle: the Punks go to
        the winner and the proceeds go to the seller.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title eyebrow">Purchase offers</h2>
      <p>
        Buyers can also work the other side of the book. A purchase offer locks
        ETH against one or more slots, each a set of trait and colour criteria —
        for example any
        <NuxtLink to="/punks?q=alien">Alien</NuxtLink>, every
        <NuxtLink to="/punks?q=hoodie">Hoodie</NuxtLink>, or specifically
        <NuxtLink to="/punks?q=6980 6981">#6980 and #6981</NuxtLink>. A seller
        can accept an offer instantly against a stored lot, or use it as the
        opening bid for a fresh auction.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title eyebrow">The contracts</h2>
      <dl class="contract-meta">
        <dt class="eyebrow">Punks Auction</dt>
        <dd>
          <a
            href="https://evm.now/address/0xA6D304EFA8c00fAE128Bc9A89a1D07E1E3922A9b"
            target="_blank"
            rel="noopener"
            ><code>punksauction.eth</code></a
          >
        </dd>
        <dt class="eyebrow">Punks Auction Escrow</dt>
        <dd>
          <a
            href="https://evm.now/address/0x4121c97DDf23d457D7E039f8dd718B8527Ca9A24"
            target="_blank"
            rel="noopener"
            ><code>escrow.punksauction.eth</code></a
          >
        </dd>
        <dt class="eyebrow">Punks Vault Factory</dt>
        <dd>
          <a
            href="https://evm.now/address/0xf3381B259B2FE142c0A87bffF463695d935D6F66"
            target="_blank"
            rel="noopener"
            ><code>punksvaultfactory.eth</code></a
          >
        </dd>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'About · Punks Auction',
  ogTitle: 'About · Punks Auction',
  twitterTitle: 'About · Punks Auction',
})
defineOgImage('Default', {
  title: 'About Punks Auction',
  description: 'Ownerless, zero-fee auction house for CryptoPunks.',
})
</script>

<style scoped>
.about-page {
  padding: var(--size-6) var(--size-4);
  display: flex;
  flex-direction: column;
  gap: var(--size-6);
  max-width: 720px;
}

.about-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
}

.about-section p {
  margin: 0;
  line-height: var(--line-height-loose);
}

.contract-meta {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--size-4);
  row-gap: var(--size-2);
  align-items: baseline;
}

.contract-meta dd {
  margin: 0;
  min-width: 0;
}

.credit {
  font-size: var(--font-sm);
}

.about-section p a,
.about-section dd a {
  color: var(--accent-strong);
  border-bottom: 1px solid var(--accent-soft);
  text-decoration: none;
}

.about-section p a:hover {
  border-bottom-color: var(--accent-strong);
}
</style>
