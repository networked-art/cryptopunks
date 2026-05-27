<template>
  <div class="container about-page">
    <header class="page-head">
      <div class="page-head-text">
        <h1>About</h1>
        <p class="muted">
          An open-source auction house on the world computer, for CryptoPunks.
        </p>
      </div>
    </header>

    <section class="about-section">
      <p>
        <a
          :href="`https://evm.now/address/${PUNKS_AUCTION_ADDRESS}/code`"
          target="_blank"
          rel="noopener"
          >PunksAuction.sol</a
        >
        is an ownerless smart contract that runs 24-hour auctions and native-ETH
        purchase offers for
        <a
          href="https://evm.now/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"
          target="_blank"
          rel="noopener"
          >CryptoPunks</a
        >. It charges no fees — every wei a bidder pays reaches the seller.
      </p>
    </section>

    <section class="about-section why-auctions">
      <h2 class="section-title eyebrow">Why auctions?</h2>
      <p>
        Auctions solve the fundamental problem of <em>price discovery</em> for
        unique assets. Fixed pricing forces sellers into an impossible dilemma:
        price too high and you get no sale; price too low and you leave money on
        the table; price "right" and you've somehow guessed what buyers will
        pay — which you can't know.
      </p>
      <h3 class="subhead eyebrow">True demand</h3>
      <p>
        The final price reflects actual willingness to pay, not a guess.
      </p>

      <h3 class="subhead eyebrow">No information asymmetry</h3>
      <p>
        Sellers don't need to know the value — buyers reveal it through
        competition.
      </p>

      <h3 class="subhead eyebrow">Self-correcting</h3>
      <p>
        Market conditions change constantly. Fixed prices go stale. Auctions are
        always current.
      </p>

      <h3 class="subhead eyebrow">Competition extracts surplus</h3>
      <p>
        Two motivated bidders push each other past what either would pay against
        a fixed ask.
      </p>

      <h3 class="subhead eyebrow">Works for unique items</h3>
      <p>
        Each Punk's trait combination is unique — no "comparable sales" exist.
        Auctions establish value where none exists.
      </p>
      <p>
        The purchase-offer system inverts the auction but achieves the same
        goal: buyers post criteria-based bids (e.g. "any Female with 3D Glasses
        under 10 ETH"), and sellers settle into the highest matching bid rather
        than guessing a list price. Price discovery through competition, from
        the other side of the book.
      </p>
      <p class="punchline">
        Fixed pricing only works when the market is liquid and items are
        fungible. Punks are neither.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title eyebrow">Vaults</h2>
      <p>
        A seller never hands custody to the auction house. Each seller keeps
        their Punks in their own <code>PunksVault</code>, deployed
        deterministically through the
        <a
          :href="`https://evm.now/address/${PUNKS_VAULT_FACTORY_ADDRESS}/code`"
          target="_blank"
          rel="noopener"
          ><code>PunksVaultFactory</code></a
        >, and approves <code>PunksAuction</code> as an operator. The auction
        pulls a Punk out of the vault only at the moment a sale starts, into a
        dedicated
        <a
          :href="`https://evm.now/address/${PUNKS_AUCTION_ESCROW_ADDRESS}/code`"
          target="_blank"
          rel="noopener"
          ><code>PunksAuctionEscrow</code></a
        >, and settles from there.
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
        <dt class="eyebrow">Auction</dt>
        <dd>
          <a
            :href="`https://evm.now/address/${PUNKS_AUCTION_ADDRESS}/code`"
            target="_blank"
            rel="noopener"
            ><code>punksauction.eth</code></a
          >
        </dd>
        <dt class="eyebrow">Escrow</dt>
        <dd>
          <a
            :href="`https://evm.now/address/${PUNKS_AUCTION_ESCROW_ADDRESS}/code`"
            target="_blank"
            rel="noopener"
            ><code>escrow.punksauction.eth</code></a
          >
        </dd>
        <dt class="eyebrow">Vault Factory</dt>
        <dd>
          <a
            :href="`https://evm.now/address/${PUNKS_VAULT_FACTORY_ADDRESS}/code`"
            target="_blank"
            rel="noopener"
            ><code>{{ PUNKS_VAULT_FACTORY_ADDRESS }}</code></a
          >
        </dd>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  PUNKS_AUCTION_ADDRESS,
  PUNKS_AUCTION_ESCROW_ADDRESS,
  PUNKS_VAULT_FACTORY_ADDRESS,
} from '~/utils/addresses'

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

.contract-meta dd code {
  word-break: break-all;
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

.subhead {
  margin: var(--size-2) 0 0;
  font-size: var(--font-sm);
}

.punchline {
  color: var(--accent-strong);
  font-style: italic;
}
</style>
