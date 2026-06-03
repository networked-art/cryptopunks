"""Point-in-time feature construction shared by training and serving.

The model learns a sale's price relative to the public floor that stood just
before it (`log(price / floor)`), from features reconstructed strictly from data
older than the sale. At serve time the same features are built for every Punk
against the current market state, so training and inference see one feature
schema. This is validated leakage-free out-of-time in `research/harness.py`.
"""

from __future__ import annotations

import bisect
import math
from typing import Any

import numpy as np
import pandas as pd

PUNK_COUNT = 10_000
TRAIT_COUNT = 111
SECONDS_PER_DAY = 86_400

# Raw per-row columns every feature frame carries; numeric_block turns them into
# the model matrix. Training rows add `target_eth`; both carry `punk_id`.
RAW_COLUMNS = [
  "punk_id", "floor", "best_bid", "active_listings",
  "med30", "med90", "med365", "cohort_med", "cohort_cnt",
  "cohort_med90", "cohort_cnt90",
  "own_last", "own_last_floor", "own_age_days", "own_sale_count",
  "trait_count", "pixel_count", "color_count", "rarest_supply",
]


# --------------------------------------------------------------------------- #
# Sales index: trailing global medians and trait-cohort medians at any time T,
# always from sales strictly older than T.
# --------------------------------------------------------------------------- #
class SalesIndex:
  def __init__(self, sales: pd.DataFrame, traits_by_punk: list[list[int]]):
    ordered = sales.sort_values("timestamp")
    self.ts = ordered["timestamp"].to_numpy(dtype=np.int64)
    self.eth = ordered["eth"].to_numpy(dtype=float)
    punk = ordered["punk_id"].to_numpy(dtype=int)
    trait_ts: dict[int, list[int]] = {t: [] for t in range(TRAIT_COUNT)}
    trait_eth: dict[int, list[float]] = {t: [] for t in range(TRAIT_COUNT)}
    for ts, eth, p in zip(self.ts, self.eth, punk):
      for t in traits_by_punk[p]:
        trait_ts[t].append(int(ts))
        trait_eth[t].append(float(eth))
    self.trait_ts = {t: np.array(v, dtype=np.int64) for t, v in trait_ts.items()}
    self.trait_eth = {t: np.array(trait_eth[t], dtype=float) for t in trait_eth}

  def trailing_median(self, T: int, window_days: int) -> tuple[float, int]:
    lo = T - window_days * SECONDS_PER_DAY
    i = bisect.bisect_left(self.ts, lo)
    j = bisect.bisect_left(self.ts, T)  # strictly < T
    if j <= i:
      return float("nan"), 0
    return float(np.median(self.eth[i:j])), int(j - i)

  def cohort_median(self, rare_traits: list[int], T: int, window_days: int) -> tuple[float, int]:
    lo = T - window_days * SECONDS_PER_DAY
    vals: list[float] = []
    for t in rare_traits:
      arr_ts = self.trait_ts[t]
      arr_eth = self.trait_eth[t]
      i = bisect.bisect_left(arr_ts, lo)
      j = bisect.bisect_left(arr_ts, T)
      if j > i:
        vals.extend(arr_eth[i:j].tolist())
    if not vals:
      return float("nan"), 0
    return float(np.median(vals)), len(vals)


def rare_traits_of(traits: list[int], supply: dict[int, int], k: int = 4) -> list[int]:
  return sorted(traits, key=lambda t: supply.get(t, PUNK_COUNT))[:k]


def trait_supply(traits_by_punk: list[list[int]]) -> dict[int, int]:
  supply: dict[int, int] = {}
  for ts in traits_by_punk:
    for t in ts:
      supply[t] = supply.get(t, 0) + 1
  return supply


# --------------------------------------------------------------------------- #
# Point-in-time floor sweep over the historical event stream (training only).
# Ownership moves retire a listing, mirroring the production floor's
# seller==owner filter. Ties at exactly T are excluded (strict < T).
# --------------------------------------------------------------------------- #
def floor_and_bid_snapshots(
  sales: pd.DataFrame,
  listings: pd.DataFrame,
  moves: pd.DataFrame,
  bids: pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray]:
  events: list[tuple[int, int, int, float]] = []  # (ts, kind, punk, price)
  for r in listings.itertuples(index=False):
    if r.type == "listing" and pd.isna(r.only_sell_to) and r.price and r.price > 0:
      events.append((int(r.ts), 0, int(r.punk_id), float(r.price)))
    else:
      events.append((int(r.ts), 1, int(r.punk_id), 0.0))
  for r in sales.itertuples(index=False):
    events.append((int(r.timestamp), 1, int(r.punk_id), 0.0))
  if moves is not None and not moves.empty:
    for r in moves.itertuples(index=False):
      events.append((int(r.ts), 1, int(r.punk_id), 0.0))
  for r in bids.itertuples(index=False):
    events.append((int(r.ts), 2 if r.type == "bid" else 3, int(r.punk_id), float(r.eth or 0.0)))
  events.sort(key=lambda e: e[0])

  active: dict[int, float] = {}
  active_bid: dict[int, float] = {}
  n = len(events)
  ptr = 0
  floors = np.full(len(sales), np.nan)
  best_bids = np.full(len(sales), np.nan)
  sale_ts = sales["timestamp"].to_numpy(dtype=np.int64)
  sale_punk = sales["punk_id"].to_numpy(dtype=int)
  for idx in range(len(sales)):
    T = int(sale_ts[idx])
    self_punk = int(sale_punk[idx])
    while ptr < n and events[ptr][0] < T:
      ts, kind, punk, price = events[ptr]
      if kind == 0:
        active[punk] = price
      elif kind == 1:
        active.pop(punk, None)
      elif kind == 2:
        active_bid[punk] = price
      else:
        active_bid.pop(punk, None)
      ptr += 1
    floors[idx] = _min_excluding(active, self_punk)
    best_bids[idx] = active_bid.get(self_punk, float("nan"))
  return floors, best_bids


def _min_excluding(active: dict[int, float], skip: int) -> float:
  best = math.inf
  for p, pr in active.items():
    if p != skip and pr < best:
      best = pr
  return best if best != math.inf else float("nan")


# --------------------------------------------------------------------------- #
# Model design matrix (numeric block + trait one-hots). Identical for train and
# serve. Returns (X, anchor) where anchor = log(floor or med90).
# --------------------------------------------------------------------------- #
def _logfill(series: pd.Series, fallback: pd.Series) -> np.ndarray:
  v = series.to_numpy(dtype=float)
  fb = fallback.to_numpy(dtype=float)
  out = np.where(np.isfinite(v) & (v > 0), v, fb)
  out = np.where(np.isfinite(out) & (out > 0), out, np.nan)
  return np.log(out)


def numeric_block(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
  med90 = df["med90"]
  floor = df["floor"]
  anchor = _logfill(floor, med90)
  lmed30 = _logfill(df["med30"], med90)
  lmed90 = _logfill(med90, df["med365"])
  lmed365 = _logfill(df["med365"], med90)
  lown = _logfill(df["own_last"], floor.where(floor.notna(), med90))
  own_age = df["own_age_days"].to_numpy(dtype=float)
  has_own = np.isfinite(own_age).astype(float)
  own_age = np.where(np.isfinite(own_age), np.minimum(own_age, 3650.0), 3650.0)
  lcohort = _logfill(df["cohort_med"], med90)
  bid = df["best_bid"].to_numpy(dtype=float)
  has_bid = (np.isfinite(bid) & (bid > 0)).astype(float)
  lbid = np.where(has_bid > 0, np.log(np.where(bid > 0, bid, 1.0)), anchor)
  bid_to_floor = np.where(has_bid > 0, lbid - anchor, 0.0)
  rarest = np.log(np.maximum(df["rarest_supply"].to_numpy(dtype=float), 1.0))
  tcount = df["trait_count"].to_numpy(dtype=float)
  pixel = df["pixel_count"].to_numpy(dtype=float) / 400.0
  color = df["color_count"].to_numpy(dtype=float) / 20.0
  active = np.log1p(df["active_listings"].to_numpy(dtype=float))
  cohort_cnt = np.log1p(df["cohort_cnt"].to_numpy(dtype=float))
  own = df["own_last"].to_numpy(dtype=float)
  ofl = df["own_last_floor"].to_numpy(dtype=float)
  has_prem = (np.isfinite(own) & np.isfinite(ofl) & (own > 0) & (ofl > 0)).astype(float)
  own_premium = np.where(has_prem > 0, np.log(np.where(own > 0, own, 1.0))
                         - np.log(np.where(ofl > 0, ofl, 1.0)), 0.0)
  own_sales = np.log1p(df["own_sale_count"].to_numpy(dtype=float))
  # Regime/momentum: recent vs medium-term market direction, and within-cohort
  # drift (90d cohort vs 365d cohort). Sharpens the recent-regime fit.
  floor_mom = lmed30 - lmed90
  lcohort90 = _logfill(df["cohort_med90"], df["med90"])
  cohort_mom = lcohort90 - lcohort
  cohort_cnt90 = np.log1p(df["cohort_cnt90"].to_numpy(dtype=float))
  feats = np.column_stack(
    [anchor, lmed30, lmed90, lmed365, lown, has_own, own_age / 365.0,
     lcohort, cohort_cnt, lbid, has_bid, bid_to_floor, rarest, tcount,
     pixel, color, active, own_premium, has_prem, own_sales,
     floor_mom, lcohort90, cohort_mom, cohort_cnt90]
  )
  return feats.astype(np.float32), anchor.astype(np.float64)


def design_matrix(df: pd.DataFrame, trait_matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
  num, anchor = numeric_block(df)
  traits = trait_matrix[df["punk_id"].to_numpy(dtype=int)]
  return np.column_stack([num, traits]).astype(np.float32), anchor


# --------------------------------------------------------------------------- #
# Training frame: one PIT row per historical V2 sale.
# --------------------------------------------------------------------------- #
def build_training_frame(
  *,
  sales: pd.DataFrame,
  listings: pd.DataFrame,
  moves: pd.DataFrame,
  bid_events: pd.DataFrame,
  traits_by_punk: list[list[int]],
  supply: dict[int, int],
  pixel_count: np.ndarray,
  color_count: np.ndarray,
) -> dict[str, Any]:
  sales = sales.sort_values("timestamp").reset_index(drop=True)
  index = SalesIndex(sales, traits_by_punk)
  floors, best_bids = floor_and_bid_snapshots(sales, listings, moves, bid_events)

  ts_all = sales["timestamp"].to_numpy(dtype=np.int64)
  eth_all = sales["eth"].to_numpy(dtype=float)
  punk_all = sales["punk_id"].to_numpy(dtype=int)

  # per-punk sale history (ts, eth, floor_then) in time order
  hist: dict[int, list[tuple[int, float, float]]] = {}
  for i in range(len(sales)):
    hist.setdefault(int(punk_all[i]), []).append(
      (int(ts_all[i]), float(eth_all[i]), float(floors[i]))
    )

  rows: list[dict[str, Any]] = []
  last_sale: dict[int, dict[str, float]] = {}
  for i in range(len(sales)):
    T = int(ts_all[i])
    punk = int(punk_all[i])
    traits = traits_by_punk[punk]
    rare = rare_traits_of(traits, supply)
    med30, _ = index.trailing_median(T, 30)
    med90, c90 = index.trailing_median(T, 90)
    med365, _ = index.trailing_median(T, 365)
    cohort_med, cohort_cnt = index.cohort_median(rare, T, 365)
    cohort_med90, cohort_cnt90 = index.cohort_median(rare, T, 90)
    own_last = own_age = own_last_floor = float("nan")
    phist = hist.get(punk, [])
    k = bisect.bisect_left([h[0] for h in phist], T)
    if k > 0:
      own_last = phist[k - 1][1]
      own_age = (T - phist[k - 1][0]) / SECONDS_PER_DAY
      own_last_floor = phist[k - 1][2]
    row = _raw_row(
      punk_id=punk, floor=float(floors[i]), best_bid=float(best_bids[i]),
      active_listings=0, med30=med30, med90=med90, med365=med365,
      cohort_med=cohort_med, cohort_cnt=cohort_cnt,
      cohort_med90=cohort_med90, cohort_cnt90=cohort_cnt90, own_last=own_last,
      own_last_floor=own_last_floor, own_age_days=own_age, own_sale_count=k,
      traits=traits, supply=supply, pixel_count=pixel_count, color_count=color_count,
      target_eth=float(eth_all[i]),
    )
    row["ts"] = T
    rows.append(row)
  # last-sale lookup for serving (eth + floor that stood then + total count)
  for punk, phist in hist.items():
    ts_p, eth_p, floor_p = phist[-1]
    last_sale[punk] = {"eth": eth_p, "floor": floor_p, "ts": ts_p, "count": len(phist)}

  frame = pd.DataFrame(rows)
  return {"frame": frame, "index": index, "last_sale": last_sale}


# --------------------------------------------------------------------------- #
# Serving frame: one row per Punk at `now_ts`, current market state.
# --------------------------------------------------------------------------- #
def build_serving_frame(
  *,
  now_ts: int,
  current_floor: dict[int, float],   # punk -> active public listing price (ETH)
  current_bid: dict[int, float],     # punk -> active best bid (ETH)
  index: SalesIndex,
  last_sale: dict[int, dict[str, float]],
  traits_by_punk: list[list[int]],
  supply: dict[int, int],
  pixel_count: np.ndarray,
  color_count: np.ndarray,
) -> pd.DataFrame:
  global_floor, second_floor, floor_punk = _two_smallest(current_floor)
  active_listings = len(current_floor)
  med30, _ = index.trailing_median(now_ts, 30)
  med90, c90 = index.trailing_median(now_ts, 90)
  med365, _ = index.trailing_median(now_ts, 365)
  cohort_cache: dict[tuple[int, ...], tuple[tuple[float, int], tuple[float, int]]] = {}

  rows: list[dict[str, Any]] = []
  for punk in range(PUNK_COUNT):
    # floor excluding this punk's own listing (matches training's excl-self)
    if punk == floor_punk:
      floor = second_floor
    else:
      floor = global_floor
    traits = traits_by_punk[punk]
    rare = tuple(rare_traits_of(traits, supply))
    if rare not in cohort_cache:
      cohort_cache[rare] = (
        index.cohort_median(list(rare), now_ts, 365),
        index.cohort_median(list(rare), now_ts, 90),
      )
    (cohort_med, cohort_cnt), (cohort_med90, cohort_cnt90) = cohort_cache[rare]
    own = last_sale.get(punk)
    own_last = own["eth"] if own else float("nan")
    own_last_floor = own["floor"] if own else float("nan")
    own_age = (now_ts - own["ts"]) / SECONDS_PER_DAY if own else float("nan")
    own_count = int(own["count"]) if own else 0
    rows.append(
      _raw_row(
        punk_id=punk, floor=floor, best_bid=current_bid.get(punk, float("nan")),
        active_listings=active_listings, med30=med30, med90=med90, med365=med365,
        cohort_med=cohort_med, cohort_cnt=cohort_cnt,
        cohort_med90=cohort_med90, cohort_cnt90=cohort_cnt90, own_last=own_last,
        own_last_floor=own_last_floor, own_age_days=own_age, own_sale_count=own_count,
        traits=traits, supply=supply, pixel_count=pixel_count, color_count=color_count,
      )
    )
  return pd.DataFrame(rows)


def _raw_row(
  *, punk_id, floor, best_bid, active_listings, med30, med90, med365,
  cohort_med, cohort_cnt, cohort_med90, cohort_cnt90, own_last, own_last_floor,
  own_age_days, own_sale_count, traits, supply, pixel_count, color_count,
  target_eth=None,
) -> dict[str, Any]:
  row = {
    "punk_id": punk_id,
    "floor": floor,
    "best_bid": best_bid,
    "active_listings": active_listings,
    "med30": med30, "med90": med90, "med365": med365,
    "cohort_med": cohort_med, "cohort_cnt": cohort_cnt,
    "cohort_med90": cohort_med90, "cohort_cnt90": cohort_cnt90,
    "own_last": own_last, "own_last_floor": own_last_floor,
    "own_age_days": own_age_days, "own_sale_count": own_sale_count,
    "trait_count": len(traits),
    "pixel_count": float(pixel_count[punk_id]),
    "color_count": float(color_count[punk_id]),
    "rarest_supply": min((supply.get(t, PUNK_COUNT) for t in traits), default=PUNK_COUNT),
  }
  if target_eth is not None:
    row["target_eth"] = target_eth
  return row


# --------------------------------------------------------------------------- #
# Sale-probability model: P(a listed Punk transacts within 24h). Snapshot every
# public listing, reconstruct the PIT market, label whether a sale followed
# within 24h. The same feature shape is built at serve time from each Punk's
# quick-sale price as the hypothetical ask.
# --------------------------------------------------------------------------- #
PROB_FEATURES = [
  "ask_ratio", "ask_vs_cohort", "ask_vs_own", "ask_percentile", "floor_mom",
  "bid_floor", "bid_meets_ask", "has_bid", "active_listings", "sales_7d",
  "sales_30d", "rarest_supply", "trait_count",
]
# Horizons we model P(sale within H of being listed). 24h is the headline; 7d
# and 30d give a liquidity curve. label column -> horizon in days.
PROB_HORIZONS = {"sold24h": 1, "sold_7d": 7, "sold_30d": 30}


def prob_design(df: pd.DataFrame) -> np.ndarray:
  x = df[PROB_FEATURES].to_numpy(dtype=float).copy()
  for j, name in enumerate(PROB_FEATURES):
    if name != "has_bid":  # log-compress the heavy-tailed ratios/counts
      x[:, j] = np.log1p(np.maximum(x[:, j], 0.0))
  return x.astype(np.float32)


def build_listing_training_frame(
  *,
  sales: pd.DataFrame,
  listings: pd.DataFrame,
  moves: pd.DataFrame,
  bid_events: pd.DataFrame,
  traits_by_punk: list[list[int]],
  supply: dict[int, int],
) -> pd.DataFrame:
  sales = sales.sort_values("timestamp").reset_index(drop=True)
  sale_ts_by_punk: dict[int, list[int]] = {}
  sale_eth_by_punk: dict[int, list[float]] = {}
  for r in sales.itertuples(index=False):
    sale_ts_by_punk.setdefault(int(r.punk_id), []).append(int(r.timestamp))
    sale_eth_by_punk.setdefault(int(r.punk_id), []).append(float(r.eth))
  global_sale_ts = sales["timestamp"].to_numpy(dtype=np.int64)
  cohort_index = SalesIndex(sales, traits_by_punk)  # PIT trait-cohort medians

  events: list[tuple[int, int, int, float]] = []
  for r in listings.itertuples(index=False):
    if r.type == "listing" and pd.isna(r.only_sell_to) and r.price and r.price > 0:
      events.append((int(r.ts), 0, int(r.punk_id), float(r.price)))
    else:
      events.append((int(r.ts), 1, int(r.punk_id), 0.0))
  for r in sales.itertuples(index=False):
    events.append((int(r.timestamp), 1, int(r.punk_id), 0.0))
  if moves is not None and not moves.empty:
    for r in moves.itertuples(index=False):
      events.append((int(r.ts), 1, int(r.punk_id), 0.0))
  for r in bid_events.itertuples(index=False):
    events.append((int(r.ts), 2 if r.type == "bid" else 3, int(r.punk_id), float(r.eth or 0.0)))
  events.sort(key=lambda e: e[0])

  queries = [
    (int(r.ts), int(r.punk_id), float(r.price))
    for r in listings.itertuples(index=False)
    if r.type == "listing" and pd.isna(r.only_sell_to) and r.price and r.price > 0
  ]
  queries.sort(key=lambda q: q[0])

  active: dict[int, float] = {}
  active_bid: dict[int, float] = {}
  n = len(events)
  ptr = 0
  rows: list[dict[str, Any]] = []
  for T, punk, price in queries:
    while ptr < n and events[ptr][0] < T:
      _, kind, p, val = events[ptr]
      if kind == 0:
        active[p] = val
      elif kind == 1:
        active.pop(p, None)
      elif kind == 2:
        active_bid[p] = val
      else:
        active_bid.pop(p, None)
      ptr += 1
    floor = min((pr for q, pr in active.items() if q != punk), default=float("nan"))
    if not (floor == floor) or floor <= 0 or price <= 0:
      continue
    best_bid = active_bid.get(punk, float("nan"))
    sts = sale_ts_by_punk.get(punk, [])
    i = bisect.bisect_right(sts, T)
    next_sale = sts[i] if i < len(sts) else None
    s7 = bisect.bisect_left(global_sale_ts, T) - bisect.bisect_left(global_sale_ts, T - 7 * SECONDS_PER_DAY)
    s30 = bisect.bisect_left(global_sale_ts, T) - bisect.bisect_left(global_sale_ts, T - 30 * SECONDS_PER_DAY)
    rare = rare_traits_of(traits_by_punk[punk], supply)
    cohort_med, _ = cohort_index.cohort_median(rare, T, 365)
    k = bisect.bisect_left(sts, T)
    own_last = sale_eth_by_punk[punk][k - 1] if k > 0 else float("nan")
    others = [pr for q, pr in active.items() if q != punk]
    ask_pct = (sum(1 for pr in others if pr < price) / len(others)) if others else 0.5
    m30, _ = cohort_index.trailing_median(T, 30)
    m90, _ = cohort_index.trailing_median(T, 90)
    floor_mom = (m30 / m90) if (m30 == m30 and m90 == m90 and m90 > 0) else 1.0
    row = prob_row(punk, price, floor, best_bid, len(active), s7, s30, supply,
                   traits_by_punk, cohort_med=cohort_med, own_last=own_last,
                   ask_percentile=ask_pct, floor_mom=floor_mom)
    for label, days in PROB_HORIZONS.items():
      row[label] = 1 if (next_sale is not None and next_sale <= T + days * SECONDS_PER_DAY) else 0
    row["ts"] = T
    rows.append(row)
  return pd.DataFrame(rows, columns=PROB_FEATURES + list(PROB_HORIZONS) + ["ts"])


def prob_row(
  punk: int, ask_eth: float, floor: float, best_bid: float,
  active_listings: int, sales_7d: int, sales_30d: int,
  supply: dict[int, int], traits_by_punk: list[list[int]],
  cohort_med: float = float("nan"), own_last: float = float("nan"),
  ask_percentile: float = 0.5, floor_mom: float = 1.0,
) -> dict[str, Any]:
  traits = traits_by_punk[punk]
  has_bid = 1.0 if best_bid == best_bid else 0.0
  ask_ratio = ask_eth / floor if floor > 0 else float("nan")
  # ask vs the Punk's own value (cohort median / own last sale); these
  # disambiguate a rare Punk priced fairly from a common Punk overpriced. Fall
  # back to ask/floor when a value proxy is missing.
  ask_vs_cohort = ask_eth / cohort_med if cohort_med == cohort_med and cohort_med > 0 else ask_ratio
  ask_vs_own = ask_eth / own_last if own_last == own_last and own_last > 0 else ask_ratio
  return {
    "ask_ratio": ask_ratio,
    "ask_vs_cohort": ask_vs_cohort,
    "ask_vs_own": ask_vs_own,
    "ask_percentile": ask_percentile,
    "floor_mom": floor_mom,
    "bid_floor": (best_bid / floor) if has_bid and floor > 0 else 0.0,
    "bid_meets_ask": (best_bid / ask_eth) if has_bid and ask_eth > 0 else 0.0,
    "has_bid": has_bid,
    "active_listings": active_listings,
    "sales_7d": sales_7d,
    "sales_30d": sales_30d,
    "rarest_supply": min((supply.get(t, PUNK_COUNT) for t in traits), default=PUNK_COUNT),
    "trait_count": len(traits),
  }


def _two_smallest(floor_map: dict[int, float]) -> tuple[float, float, int]:
  best = second = math.inf
  best_punk = -1
  for p, pr in floor_map.items():
    if pr < best:
      second = best
      best = pr
      best_punk = p
    elif pr < second:
      second = pr
  return (
    best if best != math.inf else float("nan"),
    second if second != math.inf else (best if best != math.inf else float("nan")),
    best_punk,
  )
