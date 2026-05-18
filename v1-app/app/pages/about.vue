<template>
  <div class="container about-page">
    <header class="page-head">
      <h1>About</h1>
      <p class="muted">
        Native-ETH market and bid book for the broken CryptoPunks.
      </p>
    </header>

    <section class="about-section">
      <p>
        <a
          :href="`https://evm.now/address/${PUNKS_MARKET_ADDRESS}/code`"
          target="_blank"
          rel="noopener"
          >PunksMarket.sol</a
        >
        is a smart contract that interacts with the CryptoPunks contract
        deployed
        <a
          href="https://evm.now/tx/0x9fef127966d59d440c70f28c8e6f1eac3af0d91f94384e207deb3c98ff9c3088"
          >by LarvaLabs on June 9th 2017</a
        >. It facilitates safe buys and sells, which hasn't been possible before
        as the original marketplace code had a bug: It credited sale proceeds to
        the wrong account.
      </p>
      <p>
        Selling directly is unsafe, which is why the V1 market sat broken for
        years.
      </p>
      <p>
        Still, these are the first CryptoPunks LarvaLabs ever deployed — the
        official release, retired only once the bug surfaced. Like a misprinted
        first edition or an error coin pulled from circulation, their value to
        collectors is historical: the artifact behind everything that came
        after.
      </p>
      <p>
        Wrappers became the workaround. A wrapper mints a new ERC-721 backed by
        an underlying punk and lets collectors trade that derivative on standard
        marketplaces. The tradeoff is that the original contract is bypassed
        entirely: every sale moves the wrapper, not the original token, and
        LarvaLabs' marketplace stays silent — no transfers or sales are written
        onto the artifact itself.
      </p>
      <p>
        Most of the trading since early 2022 has happened on
        <a
          href="https://x.com/frankNFT_eth"
          target="_blank"
          rel="noopener"
          >Frank</a
        >'s
        <a
          href="https://evm.now/address/0x282bdd42f4eb70e7a9d9f40c8fea0825b7f68c5d"
          >V1 wrapper</a
        >, which gave these punks a real market when none existed. This contract
        aims to route that activity back to the original CryptoPunks contract.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title">The workaround</h2>
      <p>
        PunksMarket only handles listings directed to itself. Sellers list with
        <code>offerPunkForSaleToAddress(punkId, price, punksmarket.eth)</code>.
        To settle, the contract:
      </p>
      <ol>
        <li>buys the punk as the temporary holder,</li>
        <li>
          calls <code>withdraw()</code> to pull the misrouted proceeds back from
          the V1 market,
        </li>
        <li>transfers the punk to the recipient,</li>
        <li>pays the real seller from its own balance.</li>
      </ol>
      <p>
        All four steps run in a single transaction. The contract never holds a
        punk or ETH between calls.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title">The bid book</h2>
      <p>
        The original CryptoPunks smart contract didn't ship with bidding
        features. This was only added later to the
        <a
          href="https://evm.now/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"
          >fixed redeploy on June 22nd 2017</a
        >. The new PunksMarket.sol contract enables bidding on individual punks
        as well as the entire collection, specific traits, and color
        combinations.
      </p>
      <p>
        Bids match against the sealed
        <a href="https://evm.now/address/punksdata.eth">PunksData contract</a>
        — plus optional include and exclude id lists. Bid on any
        <NuxtLink to="/?q=female+albino+wild+white"
          >wild white albino Female</NuxtLink
        >, every <NuxtLink to="/?q=alien+-635">Alien except #635</NuxtLink>, or
        specifically <NuxtLink to="/?q=6980+6981">#6980 and #6981</NuxtLink>.
      </p>
      <p>
        Bids settle against live listings, not against holders directly. A
        holder who wants to take a bid lists the punk to PunksMarket; anyone —
        the bidder, the holder, or a third party — can then call
        <code>acceptBid</code> to clear the trade. The caller earns
        <code>settlementWei</code>, an optional settle incentive; the bidder
        receives the punk and any spread between bid and listing price.
      </p>
    </section>

    <section class="about-section">
      <h2 class="section-title">The contract</h2>
      <dl class="contract-meta">
        <dt>Address</dt>
        <dd>
          <a
            :href="`https://evm.now/address/${PUNKS_MARKET_ADDRESS}/code`"
            target="_blank"
            rel="noopener"
            ><code>{{ PUNKS_MARKET_ADDRESS }}</code></a
          >
        </dd>
        <dt>ENS</dt>
        <dd>
          <a
            href="https://evm.now/address/punksmarket.eth/code"
            target="_blank"
            rel="noopener"
            ><code>punksmarket.eth</code></a
          >
        </dd>
      </dl>
      <p class="muted credit">
        Ownerless immutable deployment. Inspired by MouseDev's
        <a
          href="https://github.com/mouse-dev-1/cryptopunks-bids/blob/master/src/V2/CryptoPunksBidsV2.sol"
          target="_blank"
          rel="noopener"
          ><code>CryptoPunksBidsV2</code></a
        >.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { PUNKS_MARKET_ADDRESS } from '~/utils/addresses'

useSeoMeta({
  title: 'About · punksmarket.xyz',
  ogTitle: 'About · punksmarket.xyz',
  twitterTitle: 'About · punksmarket.xyz',
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

.page-head h1 {
  margin: 0 0 var(--size-1);
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.about-section {
  display: flex;
  flex-direction: column;
  gap: var(--size-3);
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.about-section p {
  margin: 0;
  line-height: 1.55;
}

.about-section ol {
  margin: 0;
  padding-inline-start: var(--size-7, 2rem);
  line-height: 1.55;
  list-style: decimal;
}

.about-section ol li + li {
  margin-top: var(--size-1);
}

.about-section ol li::marker {
  color: var(--text-muted);
}

.contract-meta {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--size-4);
  row-gap: var(--size-2);
  align-items: baseline;
}

.contract-meta dt {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.contract-meta dd {
  margin: 0;
  min-width: 0;
}

.contract-meta dd code {
  word-break: break-all;
}

.contract-meta a {
  border: 0;
}

.contract-meta a code {
  color: var(--accent);
}

.credit {
  font-size: 12px;
}

code {
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}

a code {
  color: var(--accent);
}

.about-section p a,
.about-section ol a {
  color: var(--accent);
  border-bottom: 1px solid var(--accent-soft);
  text-decoration: none;
}

.about-section p a:hover,
.about-section ol a:hover {
  border-bottom-color: var(--accent);
}
</style>
