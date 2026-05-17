import { getPublicClient } from '@wagmi/core';
import { b as useConfig, v as vueExports, g as f } from './server.mjs';
import { u as usePunksMarketAddress, P as PUNKS_V1_ADDRESS, p as punksMarketAbi } from './addresses-CS4rh6Zo.mjs';

const LOOKBACK_BLOCKS = 50000n;
function useActivityFeed(opts = {}) {
  const config = useConfig();
  const punksMarket = usePunksMarketAddress();
  const events = vueExports.ref([]);
  const pending = vueExports.ref(false);
  const error = vueExports.ref(null);
  async function load() {
    const client = getPublicClient(config);
    if (!client) return;
    pending.value = true;
    error.value = null;
    try {
      const head = await client.getBlockNumber();
      const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
      const v1Events = f.filter(
        (x) => x.type === "event"
      );
      const v1Logs = await client.getLogs({
        address: PUNKS_V1_ADDRESS,
        fromBlock: from,
        toBlock: head,
        events: v1Events
      });
      const pmEvents = punksMarketAbi.filter(
        (x) => x.type === "event"
      );
      const pmLogs = punksMarket.value ? await client.getLogs({
        address: punksMarket.value,
        fromBlock: from,
        toBlock: head,
        events: pmEvents
      }) : [];
      const punkFilter = vueExports.toValue(opts.punkId);
      const bidderFilter = vueExports.toValue(opts.bidder)?.toLowerCase();
      const sellerFilter = vueExports.toValue(opts.seller)?.toLowerCase();
      const mapped = [];
      for (const log of v1Logs) mapMaybe(mapped, mapV1Log(log));
      for (const log of pmLogs) mapMaybe(mapped, mapPmLog(log));
      const filtered = mapped.filter((e) => {
        if (punkFilter !== void 0 && e.punkId !== punkFilter) return false;
        if (bidderFilter && e.from?.toLowerCase() !== bidderFilter) return false;
        if (sellerFilter && e.to?.toLowerCase() !== sellerFilter) return false;
        return true;
      });
      filtered.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber - a.blockNumber);
        return b.logIndex - a.logIndex;
      });
      events.value = filtered.slice(0, 200);
    } catch (e) {
      error.value = e.message;
      events.value = [];
    } finally {
      pending.value = false;
    }
  }
  vueExports.watchEffect(() => {
    void vueExports.toValue(opts.punkId);
    void vueExports.toValue(opts.bidder);
    void vueExports.toValue(opts.seller);
    load();
  });
  return { events, pending, error, refresh: load };
}
function mapMaybe(out, value) {
  if (value) out.push(value);
}
function mapV1Log(log) {
  const args = log.args ?? {};
  const base = {
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex
  };
  switch (log.eventName) {
    case "PunkOffered":
      return {
        ...base,
        kind: "v1-listed",
        punkId: Number(args.punkIndex),
        amountWei: args.minValue,
        to: args.toAddress
      };
    case "PunkNoLongerForSale":
      return { ...base, kind: "v1-unlisted", punkId: Number(args.punkIndex) };
    case "PunkBought":
      return {
        ...base,
        kind: "v1-sold",
        punkId: Number(args.punkIndex),
        amountWei: args.value,
        from: args.fromAddress,
        to: args.toAddress
      };
    case "PunkBidEntered":
      return {
        ...base,
        kind: "v1-bid-placed",
        punkId: Number(args.punkIndex),
        amountWei: args.value,
        from: args.fromAddress
      };
    case "PunkBidWithdrawn":
      return {
        ...base,
        kind: "v1-bid-withdrawn",
        punkId: Number(args.punkIndex),
        amountWei: args.value,
        from: args.fromAddress
      };
    default:
      return null;
  }
}
function mapPmLog(log) {
  const args = log.args ?? {};
  const base = {
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex
  };
  switch (log.eventName) {
    case "PunkPurchased":
      return {
        ...base,
        kind: "pm-purchased",
        punkId: Number(args.punkId),
        amountWei: args.listingWei,
        from: args.seller,
        to: args.recipient
      };
    case "BidPlaced":
      return {
        ...base,
        kind: "pm-bid-placed",
        bidId: args.bidId,
        amountWei: args.bidWei,
        from: args.bidder
      };
    case "BidCancelled":
      return { ...base, kind: "pm-bid-cancelled", bidId: args.bidId };
    case "BidAdjusted":
      return {
        ...base,
        kind: "pm-bid-adjusted",
        bidId: args.bidId,
        amountWei: args.newBidWei
      };
    case "BidAccepted":
      return {
        ...base,
        kind: "pm-bid-accepted",
        bidId: args.bidId,
        punkId: Number(args.punkId),
        amountWei: args.bidWei,
        from: args.seller,
        to: args.bidder
      };
    default:
      return null;
  }
}

export { useActivityFeed as u };
//# sourceMappingURL=useActivityFeed-B0Q6xon9.mjs.map
