import math
from decimal import Decimal

import numpy as np
import pandas as pd

from punks_predictor.pipeline import (
  PUNK_COUNT,
  RESERVATION_MIN_SCORE,
  MarketContext,
  apply_reservation_band,
  build_reservations,
  credible_relative_floor,
  matching_market_bids_by_punk,
  normalize_native_bids,
  ordered_three,
  pair_rejected_bids,
  predict_v2,
  prediction_drivers,
  promotion_decision,
  top_trait_premiums,
  v1_v2_multiplier,
)


def wei_str(eth: float) -> str:
  return str(int(Decimal(str(eth)) * Decimal(10) ** 18))


def native_bid_event(
  punk_id: int,
  type_: str,
  eth: float,
  timestamp: int,
  *,
  bidder: str = "0xabc",
  tx_hash: str = "0xdead",
  source: str = "cryptopunks_v2",
) -> dict:
  return {
    "source": source,
    "type": type_,
    "punk_id": punk_id,
    "bidder": bidder,
    "wei_amount": wei_str(eth),
    "tx_hash": tx_hash,
    "timestamp": timestamp,
  }


def empty_sales() -> pd.DataFrame:
  return pd.DataFrame(columns=["standard", "punk_id", "timestamp"])


def rejected_row(
  *,
  punk_id: int,
  eth: float,
  bid_ts: int,
  cancel_ts: int,
  bidder: str = "0xa",
  tx_hash: str = "0xtx",
  standard: str = "v2",
) -> dict:
  return {
    "standard": standard,
    "punk_id": punk_id,
    "bidder": bidder,
    "wei": wei_str(eth),
    "eth": eth,
    "bid_ts": bid_ts,
    "cancel_ts": cancel_ts,
    "duration_days": max(0.0, (cancel_ts - bid_ts) / 86_400),
    "tx_hash": tx_hash,
  }


def reservation(eth: float, score: float) -> dict:
  return {
    "eth": eth,
    "wei": wei_str(eth),
    "timestamp": 0,
    "txHash": "0x",
    "durationDays": 0.5,
    "score": score,
  }


def test_ordered_three_sorts_quantiles():
  assert ordered_three(10.0, 5.0, 7.0) == (5.0, 7.0, 10.0)


def test_v1_v2_multiplier_shrinks_sparse_data_toward_one():
  multiplier = v1_v2_multiplier(
    v2_floor_eth=100.0,
    v1_floor_eth=50.0,
    v2_bid_eth=None,
    v1_bid_eth=None,
    recent_v2_eth=np.array([], dtype=float),
    recent_v1_eth=np.array([], dtype=float),
  )
  assert 0.9 < multiplier < 1.0


def test_v1_v2_multiplier_uses_credible_v1_market_evidence():
  multiplier = v1_v2_multiplier(
    v2_floor_eth=31.84,
    v1_floor_eth=2.97,
    v2_bid_eth=45.0,
    v1_bid_eth=5.5,
    recent_v2_eth=np.array([31.0, 32.0, 33.0], dtype=float),
    recent_v1_eth=np.array([2.8, 2.9, 3.0, 3.1, 3.2], dtype=float),
    v1_listed_count=22,
  )
  assert 0.08 < multiplier < 0.13


def test_credible_relative_floor_rejects_sparse_or_extreme_floors():
  assert (
    credible_relative_floor(
      "250000000000000000",
      "30000000000000000000",
      listed_count=1,
      min_count=2,
      max_ratio=2.5,
    )
    is None
  )
  assert (
    credible_relative_floor(
      "1000000000000000000000",
      "30000000000000000000",
      listed_count=3,
      min_count=2,
      max_ratio=2.5,
    )
    is None
  )
  assert (
    credible_relative_floor(
      "25000000000000000000",
      "30000000000000000000",
      listed_count=3,
      min_count=2,
      max_ratio=2.5,
    )
    == "25000000000000000000"
  )


def test_promotion_bootstraps_when_no_active_model():
  decision = promotion_decision(
    model_ape=0.71,
    baseline_ape=0.45,
    incumbent_ape=None,
    has_incumbent=False,
  )
  assert decision["promote"] is True


def test_promotion_rejects_model_worse_than_baseline():
  decision = promotion_decision(
    model_ape=0.71,
    baseline_ape=0.45,
    incumbent_ape=0.40,
    has_incumbent=True,
  )
  assert decision["promote"] is False
  assert "baseline" in decision["reason"]


def test_promotion_rejects_unevaluated_run_when_incumbent_exists():
  decision = promotion_decision(
    model_ape=None,
    baseline_ape=None,
    incumbent_ape=0.40,
    has_incumbent=True,
  )
  assert decision["promote"] is False


def test_promotion_rejects_regression_versus_incumbent():
  decision = promotion_decision(
    model_ape=0.50,
    baseline_ape=0.80,
    incumbent_ape=0.40,
    has_incumbent=True,
  )
  assert decision["promote"] is False
  assert "active model" in decision["reason"]


def test_promotion_allows_refresh_within_tolerance():
  decision = promotion_decision(
    model_ape=0.41,
    baseline_ape=0.80,
    incumbent_ape=0.40,
    has_incumbent=True,
  )
  assert decision["promote"] is True


def test_promotion_judges_incumbent_on_wape_not_noisy_medape():
  # Worse (noisier) medAPE but a better WAPE — the metric that matters — should
  # promote, not get locked out by a lucky-low-medAPE incumbent.
  decision = promotion_decision(
    model_ape=0.054,
    baseline_ape=0.29,
    incumbent_ape=0.0478,
    has_incumbent=True,
    model_wape=0.1048,
    incumbent_wape=0.1060,
  )
  assert decision["promote"] is True


def test_promotion_rejects_wape_regression_versus_incumbent():
  decision = promotion_decision(
    model_ape=0.05,
    baseline_ape=0.29,
    incumbent_ape=0.05,
    has_incumbent=True,
    model_wape=0.130,
    incumbent_wape=0.106,
  )
  assert decision["promote"] is False
  assert "active model" in decision["reason"]


def test_matching_market_bids_by_punk_respects_trait_masks():
  static = {
    "trait_masks": [0] * PUNK_COUNT,
    "color_masks": [0] * PUNK_COUNT,
    "pixel_count": np.full(PUNK_COUNT, 220),
    "color_count": np.full(PUNK_COUNT, 6),
  }
  static["trait_masks"][42] = 1 << 3
  bids = pd.DataFrame(
    [
      {
        "bid_wei": "100",
        "required_trait_mask": str(1 << 3),
        "forbidden_trait_mask": "0",
        "any_of_trait_mask": "0",
        "required_color_mask": "0",
        "forbidden_color_mask": "0",
        "any_of_color_mask": "0",
        "min_pixel_count": 0,
        "max_pixel_count": 999,
        "min_color_count": 0,
        "max_color_count": 99,
        "has_include_ids": False,
        "include_ids_json": "[]",
        "exclude_ids_json": "[]",
      }
    ]
  )
  assert matching_market_bids_by_punk(bids, static) == {42: "100"}


def test_pair_rejected_bids_pairs_bid_and_cancel():
  events = pd.DataFrame(
    [
      native_bid_event(1, "bid", 100.0, 1_000),
      native_bid_event(1, "bid_cancelled", 100.0, 1_000 + 2 * 86_400),
    ]
  )
  rejected = pair_rejected_bids(normalize_native_bids(events), empty_sales())
  assert len(rejected) == 1
  row = rejected.iloc[0]
  assert int(row["punk_id"]) == 1
  assert abs(float(row["eth"]) - 100.0) < 1e-9
  assert abs(float(row["duration_days"]) - 2.0) < 1e-6


def test_pair_rejected_bids_excludes_accepted_and_cleared_bids():
  # An accepted bid becomes a sale and emits no withdrawal, so it never pairs.
  accepted = pd.DataFrame([native_bid_event(2, "bid", 50.0, 1_000)])
  assert pair_rejected_bids(normalize_native_bids(accepted), empty_sales()).empty

  # A withdrawal after an intervening sale is not a seller reservation.
  events = pd.DataFrame(
    [
      native_bid_event(3, "bid", 50.0, 1_000),
      native_bid_event(3, "bid_cancelled", 50.0, 1_000 + 5 * 86_400),
    ]
  )
  sales = pd.DataFrame(
    [{"standard": "v2", "punk_id": 3, "timestamp": 1_000 + 2 * 86_400}]
  )
  assert pair_rejected_bids(normalize_native_bids(events), sales).empty


def test_pair_rejected_bids_matches_repeated_cycles_in_order():
  events = pd.DataFrame(
    [
      native_bid_event(4, "bid", 2.0, 1_000),
      native_bid_event(4, "bid_cancelled", 2.0, 1_000 + 86_400),
      native_bid_event(4, "bid", 2.0, 5_000_000),
      native_bid_event(4, "bid_cancelled", 2.0, 5_000_000 + 2 * 86_400),
    ]
  )
  rejected = pair_rejected_bids(normalize_native_bids(events), empty_sales())
  durations = sorted(round(float(d), 3) for d in rejected["duration_days"])
  assert durations == [1.0, 2.0]


def test_build_reservations_prefers_recent_over_stale_high_bid():
  now = 1_775_800_000
  rejected = pd.DataFrame(
    [
      rejected_row(
        punk_id=4441,
        eth=145.0,
        bid_ts=now - 60 * 86_400,
        cancel_ts=now - 60 * 86_400 + 40_000,
        tx_hash="0xrecent",
      ),
      rejected_row(
        punk_id=4441,
        eth=350.0,
        bid_ts=now - 1_100 * 86_400,
        cancel_ts=now - 1_100 * 86_400 + 86_400,
        tx_hash="0xstale",
      ),
    ]
  )
  result = build_reservations(rejected, standard="v2", floor_eth=31.0, now_ts=now)
  assert 4441 in result
  assert abs(result[4441]["eth"] - 145.0) < 1e-9
  assert result[4441]["txHash"] == "0xrecent"


def test_build_reservations_drops_dust_and_short_lived_bids():
  now = 1_775_800_000
  rejected = pd.DataFrame(
    [
      # Sub-floor dust: below the floor-relevance gate.
      rejected_row(
        punk_id=10,
        eth=0.2,
        bid_ts=now - 5 * 86_400,
        cancel_ts=now - 5 * 86_400 + 86_400,
      ),
      # Entered and withdrawn in the same block: no standing time, score ~ 0.
      rejected_row(
        punk_id=11,
        eth=80.0,
        bid_ts=now - 5 * 86_400,
        cancel_ts=now - 5 * 86_400,
      ),
    ]
  )
  result = build_reservations(rejected, standard="v2", floor_eth=31.0, now_ts=now)
  assert result == {}


def test_apply_reservation_band_lifts_low_off_floor_and_supports_fair():
  fair, low, high = apply_reservation_band(
    fair_eth=141.0,
    low_eth=1.8,
    high_eth=1_090.0,
    reservation=reservation(145.0, 0.74),
  )
  assert low > 50.0  # lifted substantially off the floor
  assert low < fair  # ordering preserved
  assert fair >= 141.0  # never lowered
  assert fair <= 145.0  # bounded by the rejected bid
  assert high >= fair


def test_apply_reservation_band_short_lived_bid_has_reduced_influence():
  _, low_strong, _ = apply_reservation_band(
    141.0, 1.8, 1_090.0, reservation(145.0, 0.74)
  )
  _, low_weak, _ = apply_reservation_band(
    141.0, 1.8, 1_090.0, reservation(145.0, RESERVATION_MIN_SCORE)
  )
  assert low_strong > low_weak
  assert low_weak < 20.0  # a near-zero score barely moves the band


def market_context_stub(floor_eth: float) -> MarketContext:
  return MarketContext(
    v2_floor_wei=wei_str(floor_eth),
    v1_floor_wei=None,
    v2_bid_floor_wei=None,
    v1_bid_floor_wei=None,
    v2_listed_count=0,
    v1_listed_count=0,
    v2_active_bid_count=1,
    v1_active_bid_count=0,
    recent_v2_sales_count=0,
    recent_v1_sales_count=0,
    v1_v2_multiplier=1.0,
    context_json={},
  )


def test_predict_v2_active_bid_drives_quick_sale_and_driver():
  model = {
    "p10_model": np.full(PUNK_COUNT, 40.0),
    "p50_model": np.full(PUNK_COUNT, 50.0),
    "p90_model": np.full(PUNK_COUNT, 80.0),
  }
  static = {"traits_by_punk": [[] for _ in range(PUNK_COUNT)]}
  bids = pd.DataFrame([{"punk_id": 7, "value_wei": wei_str(45.0)}])
  predictions = predict_v2(
    model=model,
    static=static,
    market=market_context_stub(50.0),
    trait_premiums={},
    comps_index={},
    current_bids=bids,
    reservations={},
  )
  by_id = {row["punk_id"]: row for row in predictions}

  bid_punk = by_id[7]
  assert "bid" in [driver["kind"] for driver in bid_punk["drivers_json"]]
  quick = float(int(bid_punk["quick_sale_wei"])) / 1e18
  assert abs(quick - 45.0) < 1.0

  no_bid_punk = by_id[8]
  assert "bid" not in [driver["kind"] for driver in no_bid_punk["drivers_json"]]


def test_trait_premium_driver_uses_resolved_trait_name():
  trait_drivers = top_trait_premiums(
    [62],
    {
      62: {
        "saleCount": 512,
        "logPremium": 0.738725983259774,
        "multiplier": 2.09326695781635,
      }
    },
  )
  assert trait_drivers[0]["traitName"] == "Hoodie"

  drivers = prediction_drivers(
    floor_eth=None,
    best_bid_eth=None,
    fair_eth=100.0,
    trait_drivers=trait_drivers,
    comps=[],
  )
  trait_driver = next(driver for driver in drivers if driver["kind"] == "trait")
  assert trait_driver["label"] == "Hoodie premium"
  assert trait_driver["traitName"] == "Hoodie"


def test_promotion_allows_reservation_run_past_baseline_within_tolerance():
  decision = promotion_decision(
    model_ape=0.50,
    baseline_ape=0.40,
    incumbent_ape=0.50,
    has_incumbent=True,
    has_reservation_signal=True,
  )
  assert decision["promote"] is True
  assert "baseline gate waived" in decision["reason"]


def test_promotion_without_reservation_still_requires_baseline():
  decision = promotion_decision(
    model_ape=0.50,
    baseline_ape=0.40,
    incumbent_ape=0.50,
    has_incumbent=True,
    has_reservation_signal=False,
  )
  assert decision["promote"] is False
  assert "baseline" in decision["reason"]


def test_promotion_reservation_run_still_rejected_when_regressing():
  decision = promotion_decision(
    model_ape=0.80,
    baseline_ape=0.40,
    incumbent_ape=0.50,
    has_incumbent=True,
    has_reservation_signal=True,
  )
  assert decision["promote"] is False
  assert "active model" in decision["reason"]


# --------------------------------------------------------------------------- #
# Floor-relative feature module
# --------------------------------------------------------------------------- #
from punks_predictor import features as F  # noqa: E402


def test_serving_frame_is_one_ordered_row_per_punk():
  tbp = [[] for _ in range(F.PUNK_COUNT)]
  tbp[5] = [3, 7]
  supply = F.trait_supply(tbp)
  pix = np.full(F.PUNK_COUNT, 220.0)
  col = np.full(F.PUNK_COUNT, 6.0)
  sales = pd.DataFrame({"punk_id": [5, 9], "timestamp": [1_000, 2_000], "eth": [10.0, 20.0]})
  index = F.SalesIndex(sales, tbp)
  frame = F.build_serving_frame(
    now_ts=3_000,
    current_floor={1: 40.0, 2: 50.0},
    current_bid={5: 12.0},
    index=index,
    last_sale={5: {"eth": 10.0, "floor": 8.0, "ts": 1_000, "count": 1}},
    traits_by_punk=tbp,
    supply=supply,
    pixel_count=pix,
    color_count=col,
  )
  assert len(frame) == F.PUNK_COUNT
  assert list(frame["punk_id"]) == list(range(F.PUNK_COUNT))
  # punk 5 carries its own last sale + active bid; an unlisted punk sees the floor
  row5 = frame[frame.punk_id == 5].iloc[0]
  assert row5["own_last"] == 10.0 and row5["best_bid"] == 12.0
  assert frame[frame.punk_id == 100].iloc[0]["floor"] == 40.0


def test_serving_floor_excludes_the_punks_own_listing():
  tbp = [[] for _ in range(F.PUNK_COUNT)]
  supply = F.trait_supply(tbp)
  pix = np.full(F.PUNK_COUNT, 220.0)
  col = np.full(F.PUNK_COUNT, 6.0)
  index = F.SalesIndex(
    pd.DataFrame({"punk_id": [0], "timestamp": [1], "eth": [1.0]}), tbp
  )
  frame = F.build_serving_frame(
    now_ts=10, current_floor={7: 30.0, 8: 45.0}, current_bid={},
    index=index, last_sale={}, traits_by_punk=tbp, supply=supply,
    pixel_count=pix, color_count=col,
  )
  # the punk that IS the floor listing sees the next-best listing, not itself
  assert frame[frame.punk_id == 7].iloc[0]["floor"] == 45.0
  assert frame[frame.punk_id == 8].iloc[0]["floor"] == 30.0


def test_design_matrix_shape_and_anchor():
  tbp = [[] for _ in range(F.PUNK_COUNT)]
  tbp[0] = [1]
  trait_matrix = np.zeros((F.PUNK_COUNT, F.TRAIT_COUNT), dtype=np.float32)
  trait_matrix[0, 1] = 1.0
  df = pd.DataFrame(
    [{
      "punk_id": 0, "floor": 30.0, "best_bid": float("nan"), "active_listings": 5,
      "med30": 32.0, "med90": 33.0, "med365": 35.0, "cohort_med": 40.0, "cohort_cnt": 3,
      "cohort_med90": 41.0, "cohort_cnt90": 1,
      "own_last": 60.0, "own_last_floor": 20.0, "own_age_days": 100.0, "own_sale_count": 1,
      "trait_count": 1, "pixel_count": 220.0, "color_count": 6.0, "rarest_supply": 100,
    }]
  )
  X, anchor = F.design_matrix(df, trait_matrix)
  assert X.shape == (1, 24 + F.TRAIT_COUNT)
  assert abs(float(anchor[0]) - math.log(30.0)) < 1e-6  # anchor = log(floor)


def test_listing_snapshot_labels_24h_sale():
  tbp = [[] for _ in range(F.PUNK_COUNT)]
  supply = F.trait_supply(tbp)
  # punk 5 listed at 30 (floor from punk 9's listing at 40); sells 12h later -> 1
  # punk 6 listed at 50; its only sale is 3 days later -> 0
  listings = pd.DataFrame(
    [
      {"punk_id": 9, "type": "listing", "ts": 100, "price": 40.0, "only_sell_to": float("nan")},
      {"punk_id": 5, "type": "listing", "ts": 1_000, "price": 30.0, "only_sell_to": float("nan")},
      {"punk_id": 6, "type": "listing", "ts": 1_000, "price": 50.0, "only_sell_to": float("nan")},
    ]
  )
  sales = pd.DataFrame(
    {"punk_id": [5, 6], "timestamp": [1_000 + 12 * 3600, 1_000 + 3 * 86_400], "eth": [29.0, 49.0]}
  )
  empty_moves = pd.DataFrame(columns=["punk_id", "ts"])
  empty_bids = pd.DataFrame(columns=["punk_id", "type", "ts", "eth"])
  frame = F.build_listing_training_frame(
    sales=sales, listings=listings, moves=empty_moves, bid_events=empty_bids,
    traits_by_punk=tbp, supply=supply,
  )
  # the frame carries no punk_id column; match rows by ask_ratio (30/40 vs 50/40)
  rows = {round(float(r["ask_ratio"]), 4): int(r["sold24h"]) for _, r in frame.iterrows()}
  assert rows[round(30.0 / 40.0, 4)] == 1  # sold within 24h
  assert rows[round(50.0 / 40.0, 4)] == 0  # sold after 24h
  assert F.prob_design(frame).shape == (2, len(F.PROB_FEATURES))


def test_training_frame_features_use_only_past_sales():
  # two sales of the same punk; the second must see the first as own_last and
  # never see itself (strict < T).
  tbp = [[] for _ in range(F.PUNK_COUNT)]
  supply = F.trait_supply(tbp)
  pix = np.full(F.PUNK_COUNT, 220.0)
  col = np.full(F.PUNK_COUNT, 6.0)
  sales = pd.DataFrame(
    {"punk_id": [3, 3], "timestamp": [1_000, 1_000 + 100 * 86_400], "eth": [10.0, 25.0]}
  )
  listings = pd.DataFrame(columns=["punk_id", "type", "ts", "price", "only_sell_to"])
  bids = pd.DataFrame(columns=["punk_id", "type", "ts", "eth"])
  moves = pd.DataFrame(columns=["punk_id", "ts"])
  built = F.build_training_frame(
    sales=sales, listings=listings, moves=moves, bid_events=bids,
    traits_by_punk=tbp, supply=supply, pixel_count=pix, color_count=col,
  )
  frame = built["frame"].sort_values("ts").reset_index(drop=True)
  assert pd.isna(frame.iloc[0]["own_last"])  # first sale has no prior sale
  assert frame.iloc[1]["own_last"] == 10.0   # second sale sees the first
  assert frame.iloc[1]["own_sale_count"] == 1
  assert built["last_sale"][3]["eth"] == 25.0
