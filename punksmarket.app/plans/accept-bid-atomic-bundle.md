# Atomic Accept-Bid via Private Bundle

The bid-acceptance flow in `PunkV1Panel.vue` runs in two transactions:
`offerPunkForSaleToAddress` on the C̩ͤ̊̄ͦͅry̸̢̯̍ͨ́̍p̛̞̘̊ͪ̕t̝o̩͗̈́͜P̹̗u̗ͬnḳ͚̫̋sMarket
(list the punk to `PunksMarket`), then `acceptBid` on `PunksMarket`
(transfer + settle). Between the two transactions there is a window
where anyone holding a competing matching bid can call
`acceptBid(otherBid, …)` against the freshly-listed state and snipe the
punk against a different bid.

This plan describes folding both steps into a single private bundle so
no one can race step 2.

## Current state

The two-step flow is permissionless on purpose — anyone holding a
matching bid can settle — and the UI is honest about that:

- *Skip on step 2.* If someone else has already accepted the bid by the
  time we reach step 2, the multi-tx runner skips the call and reports
  the bid as settled rather than reverting.
- *Lead on step 1.* `PunkV1Panel.vue` shows an `Alert type="info"`
  explaining "This bid can be settled by anyone while the listing is
  live. You receive the listed price either way."

Together these make the UX honest about permissionless settlement. They
do not remove the front-run window.

## Why we're not shipping the full bundle path yet

- The seller never *loses money* to front-running. The listing locks
  `priceWei`; whoever calls `acceptBid` pays the seller exactly that amount.
- The only harm is a wasted step 2 (already handled gracefully — see
  Current state) and the "intended" bid losing the punk to a competing
  matching bid.
- Wallet-side support for private mempools is uneven, especially for
  injected wallets that do not let dApps choose the submission endpoint.

If/when we want true atomicity (e.g. the punk supply gets thin enough that
caller-reward sniping becomes routine, or we want to honor a *specific* bid),
this plan is the path.

## What the bundle path looks like

Three candidate endpoints, with meaningfully different guarantees:

- **Flashbots Auction** ([docs](https://docs.flashbots.net/flashbots-auction/quick-start))
  — bundle API at `https://relay.flashbots.net`. We POST
  `{txs: [signedTx1, signedTx2], blockNumber}` and the relay lands both in
  the target block or neither. The only candidate that delivers true
  bundle-or-nothing inclusion. Requires a dApp-held ECDSA-secp256k1 key for
  reputation (no funds custody); MetaMask alone can't drive the bundle
  envelope.
- **Flashbots Protect** ([docs](https://docs.flashbots.net/flashbots-protect/quick-start))
  — user-side RPC swap to `https://rpc.flashbots.net/fast`. Each tx is
  submitted privately, but as independent submissions — no atomicity
  binding step 1 to step 2. Upside: reverted txs don't incur gas, which
  softens the "step 2 reverted because someone else won the bid" failure
  mode.
- **MEV Blocker** — similar shape to Protect (user-side RPC swap, per-tx
  privacy, MEV refunds). Same atomicity caveat.

Only Auction closes the front-run window between step 1 and step 2.
Protect / MEV Blocker hide step 1 from the public mempool but don't bind
its inclusion to step 2.

## Codebase shape

The change is concentrated in the multi-tx runner, not the contracts.

1. **Detect or opt in to bundle submission.** Two flavors with different
   guarantees:
   - *Wallet RPC swap (Protect / MEV Blocker).* User points their wallet at
     the private RPC once; both txs are submitted privately without code
     changes. We can prompt this from the UI on first accept-bid attempt.
     Privacy only — no bundle-or-nothing guarantee.
   - *Bundle API call (Auction, true atomicity).* We build both signed txs
     ourselves and POST to `https://relay.flashbots.net`. Requires a
     separate signer flow per tx (wallet sees two `eth_signTransaction`
     prompts back-to-back) and a dApp-held ECDSA reputation key to identify
     us to the relay.

2. **Wrap the two existing `ContractWritePlan`s.** Reuse
   `sdk.market.prepareList(...)` and `sdk.v1Market.prepareAcceptBid(...)` —
   no SDK changes needed. The runner needs to:
   - Get the current nonce, build tx1 (list), tx2 (acceptBid) with
     `nonce`, `nonce+1`.
   - Sign both via the wallet (viem `walletClient.signTransaction`).
   - POST `{txs: [signedTx1, signedTx2], blockNumber: '0x…+1'}` to the
     bundle endpoint, plus a fallback target block window.

3. **Wait for inclusion or fall back.** If the bundle isn't included after
   a few target blocks:
   - Either resubmit to the next block window, or
   - Fall back to the public mempool (the current two-step flow) — we
     already handle the "settled by someone else" case gracefully.

4. **UI changes.** Replace the two-step `EvmMultiTransactionFlowDialog` with
   a single-progress "Accept Bid" dialog when bundle mode is active. Two
   sub-states: "Signing both transactions" and "Waiting for bundle
   inclusion". Keep the multi-step dialog as the fallback path.

## Open questions

- **Wallet support.** RainbowKit / WalletConnect / injected — which of
  these can we drive through a custom RPC without forcing a network swap?
  Investigate `wagmi` connector overrides, and whether MetaMask / Frame
  honor a per-dApp RPC for signing only (not for reads).
- **Fee market.** Flashbots requires effective priority fees high enough to
  out-bid the builder's default block. Setting a sane priority + max fee
  per gas from the front-end without surprising the user.
- **Cancellation.** If the seller dismisses mid-flow after signing tx1 but
  before tx2 lands, the signed listing is still floating. Bundle-or-nothing
  inclusion should prevent it from landing solo, but we need a clear
  story (and tests) for the "user closed the tab" case.
- **Nonce safety.** If the user has a queued tx (nonce drift), the bundle
  will get rejected. Either lock the UI to inhibit other writes during
  bundling or fetch the freshest pending nonce immediately before signing.
- **Indexer / event handling.** The accept-bid event still emits as today;
  the indexer doesn't need to know it came from a bundle. Just verify the
  activity feed surfaces both txs naturally.
- **Relay identity key.** Auction needs an ECDSA-secp256k1 key per
  submitter (reputation only, no custody). Decide where it lives: bundled
  into the deployed frontend (anyone reading our source sees it and our
  reputation is shared), generated per-session client-side (starts from
  zero reputation each time), or held by a tiny relay service we run
  (adds infra). Bundled-with-frontend is probably fine to start since
  reputation only matters under relay congestion.

## Intermediate step: Protect opt-in via help page

A cheaper sibling of the full bundle path that captures most of the
user-visible win without the dialog overhaul or bundle infrastructure.
Ship a help / FAQ page that:

- Explains the front-run window in plain language (the existing
  `Alert type="info"` in `PunkV1Panel.vue` — "this bid can be settled by
  anyone while the listing is live" — gets a "Learn how to avoid this"
  link to the page).
- Walks the user through adding the Flashbots Protect RPC
  (`https://rpc.flashbots.net/fast`) to their wallet — at minimum
  MetaMask, with notes for other common wallets.
- Calls out the two concrete benefits: privacy (step 1 doesn't appear in
  the public mempool, so no one races us to step 2) and no gas on
  reverted txs (Protect doesn't charge if step 2 reverts because someone
  else won the bid first).

What this *doesn't* deliver: bundle-or-nothing inclusion. A reorg or
out-of-order inclusion can still leave us unlisted-then-stuck. But
relative to the current two-step flow, the front-run surface area is
materially smaller, at a cost of roughly: one help page, one link, and
zero runtime changes.

The page is also load-bearing for the full bundle path: when that ships,
the same RPC swap is the natural fallback for users who hit a missed
inclusion window, so the setup is already done.

## How everything layers

The current state (skip + alert), the intermediate step (help page +
link from the alert), and the full bundle path are additive:

- The intermediate step extends the existing alert with a "Learn how to
  avoid this" link to the help page. Same dialog, additional opt-in
  education.
- When the full bundle path ships and succeeds, the multi-step dialog is
  bypassed entirely — no skip callback needed.
- When the bundle path isn't available (user didn't opt in) or fails
  (bundle never included), we fall back to the public-mempool two-step
  flow, where the skip behavior and the alert already make the failure
  modes visible.

## Out of scope

- **EIP-7702 atomic execution.** Strictly better from a UX standpoint
  (single tx, single signature), but it's a structural change (auth +
  delegate contract + new deploy + wallet support for 7702 authorizations).
  Worth its own plan once 7702 wallet UX stabilizes.
- **Smart wallet (4337).** Requires the seller to be on a smart wallet — a
  separate adoption story, not a drop-in upgrade.
- **Changes to `PunksMarket`.** Out of bounds — deployed and frozen.
