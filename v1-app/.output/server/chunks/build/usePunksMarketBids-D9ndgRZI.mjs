import { getPublicClient } from '@wagmi/core';
import { b as useConfig, v as vueExports } from './server.mjs';
import { u as usePunksMarketAddress, p as punksMarketAbi } from './addresses-CS4rh6Zo.mjs';

const LOOKBACK_BLOCKS = 200000n;
function usePunksMarketBids(opts = {}) {
  const config = useConfig();
  const punksMarket = usePunksMarketAddress();
  const bids = vueExports.ref([]);
  const pending = vueExports.ref(false);
  const error = vueExports.ref(null);
  async function load() {
    const client = getPublicClient(config);
    const address = punksMarket.value;
    if (!client || !address) {
      bids.value = [];
      return;
    }
    pending.value = true;
    error.value = null;
    try {
      const head = await client.getBlockNumber();
      const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
      const events = punksMarketAbi.filter(
        (x) => x.type === "event"
      );
      const logs = await client.getLogs({ address, fromBlock: from, toBlock: head, events });
      const state = /* @__PURE__ */ new Map();
      for (const raw of logs) {
        const log = raw;
        const args = log.args ?? {};
        if (log.eventName === "BidPlaced") {
          const id = args.bidId;
          state.set(String(id), {
            id,
            bidder: args.bidder,
            bidWei: args.bidWei,
            settlementWei: args.settlementWei,
            includeIds: args.includeIds?.map((n) => Number(n)) ?? [],
            excludeIds: args.excludeIds?.map((n) => Number(n)) ?? [],
            active: true,
            placedAtBlock: log.blockNumber
          });
        } else if (log.eventName === "BidAdjusted") {
          const existing = state.get(String(args.bidId));
          if (existing) existing.bidWei = args.newBidWei;
        } else if (log.eventName === "BidCancelled" || log.eventName === "BidAccepted") {
          const existing = state.get(String(args.bidId));
          if (existing) existing.active = false;
        }
      }
      const bidder = vueExports.toValue(opts.bidder)?.toLowerCase();
      const all = [...state.values()].filter((b) => {
        if (!b.active) return false;
        if (bidder && b.bidder.toLowerCase() !== bidder) return false;
        return true;
      });
      all.sort((a, b) => Number(b.bidWei - a.bidWei));
      bids.value = all;
    } catch (e) {
      error.value = e.message;
      bids.value = [];
    } finally {
      pending.value = false;
    }
  }
  vueExports.watchEffect(() => {
    void vueExports.toValue(opts.bidder);
    load();
  });
  return { bids, pending, error, refresh: load };
}

export { usePunksMarketBids as u };
//# sourceMappingURL=usePunksMarketBids-D9ndgRZI.mjs.map
