from __future__ import annotations

import bisect
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP, localcontext
import hashlib
import json
import math
from typing import Any, Iterable

import numpy as np
import pandas as pd
from psycopg import Connection, sql
from psycopg.types.json import Jsonb
from sklearn.ensemble import HistGradientBoostingRegressor

from . import __version__, features
from .db import DatabaseConfig, connect
from .trait_names import display_trait_name, trait_name_for_id


PUNK_COUNT = 10_000
TRAIT_COUNT = 111
WEI_PER_ETH = Decimal("1000000000000000000")
SECONDS_PER_DAY = 86_400
MODEL_VERSION = f"punks-24h-v{__version__}"
RANDOM_STATE = 1001
PUNKS_MARKET_ADDRESS = "0x64e507febf26521b73fbdfa533106b2042533218"
# Floor-relative model: predict log(price / point-in-time floor), weight training
# by price^VALUE_WEIGHT so the expensive sales that dominate value-weighted error
# are fit accurately, then snap a small predicted premium back to the floor so
# common near-floor Punks keep the tight floor median. Validated out-of-time in
# research/harness.py (tail error cut ~3x vs floor-only).
VALUE_WEIGHT = 0.6
PREMIUM_SNAP = 0.10
INTERVAL_COVERAGE = 0.80
# Calibrate interval bands on a recent out-of-sample window so the calibration
# model is close to the served full-data model. A stale 85/15 split over-covers
# (~87%) with wide bands; this lands near 80% with ~40% tighter bands.
INTERVAL_CALIBRATION_DAYS = 60
# Residual spread grows with predicted premium: a 5x-floor Punk is far less
# certain than a near-floor one. Scale the band by 1 + K*max(0, log(premium)) so
# coverage holds across the premium range. A flat band leaves the premium third
# of ETH volume badly under-covered (1.5-8x floor ~40-50% vs the 80% target); at
# K=1.4 those segments reach ~60-79% while the near-floor bulk stays tight.
INTERVAL_PREMIUM_SCALE = 1.4
# Trailing window for the live realized backtest: score every public V2 sale in
# this window against the prediction that was actually live when it sold. A
# window (not just the outgoing run's brief life) gives a stable sample now that
# runs promote frequently.
REALIZED_WINDOW_DAYS = 14
# A refreshed run may carry a little more error than the incumbent (different
# out-of-time test set) and still be worth promoting for the newer market data.
PROMOTION_REGRESSION_TOLERANCE = 0.05

V2_SALE_SOURCES = {"cryptopunks_v2"}
V1_SALE_SOURCES = {"cryptopunks_v1", "punks_market"}

# Sources that carry per-Punk native bids. PunksMarket (`punks_market`) bids are
# collection criteria bids without a `punk_id`, so they are not per-Punk seller
# reservation signals and are deferred from this signal.
NATIVE_BID_SOURCES = ("cryptopunks_v2", "cryptopunks_v1")

# A rejected bid — a native bid that stood and was later withdrawn without an
# intervening sale — is read as a seller reservation above that price and as
# buyer willingness at it. We weight it by recency and how long it stood, then
# raise valuation bands toward it without letting it dominate the sale comps.
RESERVATION_RECENCY_DECAY_DAYS = 180.0
# A bid live for at least this long earns full credit for its duration; one that
# enters and is withdrawn within minutes earns almost none.
RESERVATION_FULL_DURATION_DAYS = 0.25
# Ignore bids old enough that recency alone discounts them to noise (~1.5 years).
RESERVATION_MIN_RECENCY = 0.05
RESERVATION_MIN_SCORE = 0.05
# Dust and sub-floor bids carry no reservation information about value at floor.
RESERVATION_DUST_ETH = 0.05
RESERVATION_FLOOR_RATIO = 0.5
# Fair value is pulled a bounded share of the way toward the rejected bid level.
RESERVATION_FAIR_TARGET_MULT = 1.0
RESERVATION_FAIR_WEIGHT = 0.6
# The low band is lifted to a score-discounted fraction of the rejected bid so a
# recent high rejected bid cannot leave p10 sitting near the floor.
RESERVATION_P10_TARGET_MULT = 0.85
RESERVATION_MAX_LOW_FRACTION_OF_FAIR = 0.95


@dataclass(frozen=True)
class TrainConfig:
  views_schema: str
  run_id: str
  trained_at: datetime
  data_cutoff: datetime


@dataclass(frozen=True)
class MarketContext:
  v2_floor_wei: str | None
  v1_floor_wei: str | None
  v2_bid_floor_wei: str | None
  v1_bid_floor_wei: str | None
  v2_listed_count: int
  v1_listed_count: int
  v2_active_bid_count: int
  v1_active_bid_count: int
  recent_v2_sales_count: int
  recent_v1_sales_count: int
  v1_v2_multiplier: float
  context_json: dict[str, Any]


@dataclass(frozen=True)
class PredictionRun:
  run_id: str
  model_version: str
  trained_at: datetime
  data_cutoff: datetime
  training_started_at: datetime
  training_finished_at: datetime
  metrics: dict[str, Any]
  config: dict[str, Any]
  market_context: MarketContext
  predictions: list[dict[str, Any]]
  backtests: dict[str, dict[str, Any]]


def train_and_store(config: DatabaseConfig) -> PredictionRun:
  training_started_at = utc_now()
  with connect(config) as conn:
    dataset = load_dataset(conn, config.views_schema)
    run = build_prediction_run(
      dataset=dataset,
      views_schema=config.views_schema,
      training_started_at=training_started_at,
    )
    # Score the outgoing live model against sales since it was promoted before we
    # supersede it; accumulates a true in-production accuracy record. Mirror it
    # into metrics so it surfaces on the `/predictions/model` endpoint.
    realized = realized_backtest(conn, dataset)
    run.backtests["live_realized"] = realized
    run.metrics["liveRealized"] = realized
    store_prediction_run(conn, run)
    return run


def build_prediction_run(
  *,
  dataset: dict[str, pd.DataFrame],
  views_schema: str,
  training_started_at: datetime,
) -> PredictionRun:
  trained_at = utc_now()
  data_cutoff = trained_at
  run_id = make_run_id(trained_at)
  train_config = TrainConfig(
    views_schema=views_schema,
    run_id=run_id,
    trained_at=trained_at,
    data_cutoff=data_cutoff,
  )

  traits = dataset["traits"]
  visuals = dataset["visuals"]
  events = dataset["events"]
  static = build_static_features(traits, dataset["colors"], visuals)
  sales = normalize_sales(events)
  v2_sales = sales[sales["standard"] == "v2"].copy()
  v1_sales = sales[sales["standard"] == "v1"].copy()
  market = build_market_context(dataset, v2_sales, v1_sales)

  now_ts = int(datetime.now(tz=UTC).timestamp())
  rejected_bids = pair_rejected_bids(normalize_native_bids(dataset["native_bids"]), sales)
  v2_reservations = build_reservations(
    rejected_bids,
    standard="v2",
    floor_eth=wei_to_eth(market.v2_floor_wei),
    now_ts=now_ts,
  )
  v1_reservations = build_reservations(
    rejected_bids,
    standard="v1",
    floor_eth=wei_to_eth(market.v1_floor_wei),
    now_ts=now_ts,
  )

  premium_sales, premium_logs = trait_premium_training_data(dataset, v2_sales, static)
  trait_premiums = compute_trait_premiums(
    premium_sales, static["trait_matrix"], premium_logs=premium_logs
  )
  comps_index = build_comps_index(v2_sales, static["traits_by_punk"])
  v2_model = train_price_model(dataset, v2_sales, static, now_ts)
  sale_prob_model = train_sale_probability(dataset, v2_sales, static, now_ts)
  v2_predictions = predict_v2(
    model=v2_model,
    static=static,
    market=market,
    trait_premiums=trait_premiums,
    comps_index=comps_index,
    current_bids=dataset["v2_bids"],
    reservations=v2_reservations,
    sale_prob_model=sale_prob_model,
  )
  v1_predictions = predict_v1(
    v2_predictions=v2_predictions,
    market=market,
    current_bids=dataset["v1_bids"],
    market_bids=dataset["market_bids"],
    static=static,
    reservations=v1_reservations,
  )

  predictions = v2_predictions + v1_predictions
  training_finished_at = utc_now()
  metrics = {
    "target": "24h_sale",
    "sale_count_v2": int(len(v2_sales)),
    "sale_count_v1": int(len(v1_sales)),
    "model": v2_model["metrics"],
    "market": market.context_json,
    "reservation": reservation_metrics(
      rejected_bids, v2_reservations, v1_reservations
    ),
    "saleProbability": (
      sale_prob_model["metrics"] if sale_prob_model else {"kind": "heuristic"}
    ),
  }
  backtests = {
    "v2_out_of_time": v2_model["metrics"],
    "baselines": v2_model["baseline_metrics"],
  }

  return PredictionRun(
    run_id=train_config.run_id,
    model_version=MODEL_VERSION,
    trained_at=train_config.trained_at,
    data_cutoff=train_config.data_cutoff,
    training_started_at=training_started_at,
    training_finished_at=training_finished_at,
    metrics=metrics,
    config={
      "views_schema": train_config.views_schema,
      "external_marketplaces": "excluded",
      "v1_strategy": "v2_value_times_liquidity_multiplier",
      "prediction_count": len(predictions),
    },
    market_context=market,
    predictions=predictions,
    backtests=backtests,
  )


def load_dataset(conn: Connection, views_schema: str) -> dict[str, pd.DataFrame]:
  return {
    "events": frame(
      conn,
      views_schema,
      """
      SELECT
        source,
        type,
        punk_id::int AS punk_id,
        wei_amount::text AS wei_amount,
        listing_wei::text AS listing_wei,
        bid_wei::text AS bid_wei,
        only_sell_to,
        tx_hash,
        timestamp::bigint AS timestamp
      FROM {schema}.events
      WHERE punk_id IS NOT NULL
        AND (
          (type = 'sale' AND wei_amount IS NOT NULL AND wei_amount > 0)
          OR type IN ('listing', 'listing_cancelled')
        )
      """,
    ),
    "moves": frame(
      conn,
      views_schema,
      """
      SELECT punk_id::int AS punk_id, timestamp::bigint AS ts
      FROM {schema}.events
      WHERE source = 'cryptopunks_v2' AND punk_id IS NOT NULL
        AND type IN ('transfer', 'stashed', 'unstashed')
      """,
    ),
    "traits": frame(
      conn,
      views_schema,
      """
      SELECT punk_id::int AS punk_id, trait_id::int AS trait_id
      FROM {schema}.punk_traits
      """,
    ),
    "visuals": frame(
      conn,
      views_schema,
      """
      SELECT
        punk_id::int AS punk_id,
        pixel_count::int AS pixel_count,
        color_count::int AS color_count
      FROM {schema}.punk_visuals
      """,
    ),
    "colors": frame(
      conn,
      views_schema,
      """
      SELECT punk_id::int AS punk_id, color_id::int AS color_id
      FROM {schema}.punk_colors
      """,
    ),
    "v2_listings": frame(
      conn,
      views_schema,
      """
      SELECT l.punk_id::int AS punk_id, l.min_value_wei::text AS value_wei
      FROM {schema}.listings l
      JOIN {schema}.punks p ON p.punk_id = l.punk_id
      WHERE l.active = true
        AND l.only_sell_to IS NULL
        AND p.native_owner IS NOT NULL
        AND lower(l.seller) = lower(p.native_owner)
      ORDER BY l.min_value_wei ASC, l.punk_id ASC
      """,
    ),
    "v1_listings": frame(
      conn,
      views_schema,
      """
      SELECT l.punk_id::int AS punk_id, l.min_value_wei::text AS value_wei
      FROM {schema}.v1_listings l
      JOIN {schema}.v1_punks p ON p.punk_id = l.punk_id
      WHERE l.active = true
        AND (
          l.only_sell_to IS NULL
          OR lower(l.only_sell_to) = {punks_market_address}
        )
        AND p.native_owner IS NOT NULL
        AND lower(l.seller) = lower(p.native_owner)
      ORDER BY l.min_value_wei ASC, l.punk_id ASC
      """,
      punks_market_address=PUNKS_MARKET_ADDRESS,
    ),
    "native_bids": frame(
      conn,
      views_schema,
      """
      SELECT
        source,
        type,
        punk_id::int AS punk_id,
        lower(bidder) AS bidder,
        wei_amount::text AS wei_amount,
        tx_hash,
        timestamp::bigint AS timestamp
      FROM {schema}.events
      WHERE punk_id IS NOT NULL
        AND bidder IS NOT NULL
        AND wei_amount IS NOT NULL
        AND wei_amount > 0
        AND type IN ('bid', 'bid_cancelled')
        AND source = ANY({native_bid_sources})
      """,
      native_bid_sources=list(NATIVE_BID_SOURCES),
    ),
    "v2_bids": frame(
      conn,
      views_schema,
      """
      SELECT punk_id::int AS punk_id, value_wei::text AS value_wei
      FROM {schema}.punk_bids
      WHERE active = true AND value_wei > 0
      """,
    ),
    "v1_bids": frame(
      conn,
      views_schema,
      """
      SELECT punk_id::int AS punk_id, value_wei::text AS value_wei
      FROM {schema}.v1_punk_bids
      WHERE active = true AND value_wei > 0
      """,
    ),
    "market_bids": frame(
      conn,
      views_schema,
      """
      SELECT
        bid_id::text AS bid_id,
        bid_wei::text AS bid_wei,
        required_trait_mask::text AS required_trait_mask,
        forbidden_trait_mask::text AS forbidden_trait_mask,
        any_of_trait_mask::text AS any_of_trait_mask,
        required_color_mask::text AS required_color_mask,
        forbidden_color_mask::text AS forbidden_color_mask,
        any_of_color_mask::text AS any_of_color_mask,
        min_pixel_count::int AS min_pixel_count,
        max_pixel_count::int AS max_pixel_count,
        min_color_count::int AS min_color_count,
        max_color_count::int AS max_color_count,
        has_include_ids,
        include_ids_json,
        exclude_ids_json
      FROM {schema}.market_bids
      WHERE active = true AND bid_wei > 0
      """,
    ),
  }


def frame(
  conn: Connection,
  views_schema: str,
  query: str,
  **literals: str,
) -> pd.DataFrame:
  format_args = {"schema": sql.Identifier(views_schema)}
  format_args.update(
    {name: sql.Literal(value) for name, value in literals.items()}
  )
  rendered = sql.SQL(query).format(**format_args)
  cursor = conn.execute(rendered)
  rows = cursor.fetchall()
  columns = [column.name for column in cursor.description or []]
  return pd.DataFrame(rows, columns=columns)


def build_static_features(
  traits: pd.DataFrame,
  colors: pd.DataFrame,
  visuals: pd.DataFrame,
) -> dict[str, Any]:
  trait_matrix = np.zeros((PUNK_COUNT, TRAIT_COUNT), dtype=np.float32)
  trait_masks = [0] * PUNK_COUNT
  color_masks = [0] * PUNK_COUNT
  traits_by_punk: list[list[int]] = [[] for _ in range(PUNK_COUNT)]
  if not traits.empty:
    for row in traits.itertuples(index=False):
      punk_id = int(row.punk_id)
      trait_id = int(row.trait_id)
      if 0 <= punk_id < PUNK_COUNT and 0 <= trait_id < TRAIT_COUNT:
        trait_matrix[punk_id, trait_id] = 1.0
        trait_masks[punk_id] |= 1 << trait_id
        traits_by_punk[punk_id].append(trait_id)

  if not colors.empty:
    for row in colors.itertuples(index=False):
      punk_id = int(row.punk_id)
      color_id = int(row.color_id)
      if 0 <= punk_id < PUNK_COUNT and color_id >= 0:
        color_masks[punk_id] |= 1 << color_id

  pixel_count = np.full(PUNK_COUNT, 220.0, dtype=np.float32)
  color_count = np.full(PUNK_COUNT, 6.0, dtype=np.float32)
  if not visuals.empty:
    for row in visuals.itertuples(index=False):
      punk_id = int(row.punk_id)
      if 0 <= punk_id < PUNK_COUNT:
        pixel_count[punk_id] = float(row.pixel_count)
        color_count[punk_id] = float(row.color_count)

  trait_count = trait_matrix.sum(axis=1).astype(np.float32)
  numeric = np.column_stack(
    [
      np.arange(PUNK_COUNT, dtype=np.float32) / float(PUNK_COUNT),
      pixel_count / 400.0,
      color_count / 20.0,
      trait_count / 10.0,
    ]
  ).astype(np.float32)
  features = np.column_stack([numeric, trait_matrix]).astype(np.float32)
  return {
    "features": features,
    "trait_matrix": trait_matrix,
    "trait_masks": trait_masks,
    "color_masks": color_masks,
    "traits_by_punk": traits_by_punk,
    "trait_count": trait_count,
    "pixel_count": pixel_count,
    "color_count": color_count,
  }


def normalize_sales(events: pd.DataFrame) -> pd.DataFrame:
  if events.empty:
    return pd.DataFrame(
      columns=["standard", "punk_id", "timestamp", "wei", "eth", "source", "tx_hash"]
    )
  rows: list[dict[str, Any]] = []
  for row in events.itertuples(index=False):
    if row.type != "sale":
      continue
    standard = sale_standard(str(row.source))
    if standard is None:
      continue
    wei = parse_wei(row.wei_amount)
    if wei is None or wei <= 0:
      continue
    punk_id = int(row.punk_id)
    if not 0 <= punk_id < PUNK_COUNT:
      continue
    rows.append(
      {
        "standard": standard,
        "punk_id": punk_id,
        "timestamp": int(row.timestamp),
        "wei": wei,
        "eth": float(Decimal(wei) / WEI_PER_ETH),
        "source": str(row.source),
        "tx_hash": str(row.tx_hash),
      }
    )
  if not rows:
    return pd.DataFrame(
      columns=["standard", "punk_id", "timestamp", "wei", "eth", "source", "tx_hash"]
    )
  out = pd.DataFrame(rows)
  return out[(out["eth"] > 0) & (out["eth"] < 100_000)].reset_index(drop=True)


def sale_standard(source: str) -> str | None:
  if source in V2_SALE_SOURCES:
    return "v2"
  if source in V1_SALE_SOURCES:
    return "v1"
  return None


def normalize_native_bids(events: pd.DataFrame) -> pd.DataFrame:
  columns = ["standard", "punk_id", "bidder", "wei", "eth", "type", "timestamp", "tx_hash"]
  if events.empty:
    return pd.DataFrame(columns=columns)
  rows: list[dict[str, Any]] = []
  for row in events.itertuples(index=False):
    if row.type not in ("bid", "bid_cancelled"):
      continue
    standard = sale_standard(str(row.source))
    if standard is None:
      continue
    wei = parse_wei(row.wei_amount)
    if wei is None or wei <= 0:
      continue
    punk_id = int(row.punk_id)
    if not 0 <= punk_id < PUNK_COUNT:
      continue
    rows.append(
      {
        "standard": standard,
        "punk_id": punk_id,
        "bidder": str(row.bidder),
        "wei": wei,
        "eth": float(Decimal(wei) / WEI_PER_ETH),
        "type": str(row.type),
        "timestamp": int(row.timestamp),
        "tx_hash": str(row.tx_hash),
      }
    )
  if not rows:
    return pd.DataFrame(columns=columns)
  return pd.DataFrame(rows)


def pair_rejected_bids(
  native_bids: pd.DataFrame,
  sales: pd.DataFrame,
) -> pd.DataFrame:
  """Pair each entered bid with the withdrawal that retired it and keep the
  pairs that were never cleared by a sale. An accepted bid becomes a sale and
  emits no withdrawal, so it never pairs here; a bid that stood and was then
  withdrawn with no intervening sale is read as a seller reservation above it."""
  columns = [
    "standard", "punk_id", "bidder", "wei", "eth",
    "bid_ts", "cancel_ts", "duration_days", "tx_hash",
  ]
  if native_bids.empty:
    return pd.DataFrame(columns=columns)
  sales_by_punk = sales_timestamps_by_punk(sales)
  rows: list[dict[str, Any]] = []
  group_keys = ["standard", "punk_id", "bidder", "wei"]
  # 'bid' sorts before 'bid_cancelled', so same-timestamp pairs match correctly.
  ordered = native_bids.sort_values(["timestamp", "type"])
  for (standard, punk_id, bidder, wei), group in ordered.groupby(group_keys, sort=False):
    pending: list[dict[str, Any]] = []
    for row in group.itertuples(index=False):
      if row.type == "bid":
        pending.append({"timestamp": int(row.timestamp), "tx_hash": str(row.tx_hash)})
        continue
      if not pending:
        continue
      entered = pending.pop(0)
      bid_ts = int(entered["timestamp"])
      cancel_ts = int(row.timestamp)
      if sale_cleared_between(sales_by_punk, str(standard), int(punk_id), bid_ts, cancel_ts):
        continue
      rows.append(
        {
          "standard": str(standard),
          "punk_id": int(punk_id),
          "bidder": str(bidder),
          "wei": int(wei),
          "eth": float(Decimal(int(wei)) / WEI_PER_ETH),
          "bid_ts": bid_ts,
          "cancel_ts": cancel_ts,
          "duration_days": max(0.0, (cancel_ts - bid_ts) / SECONDS_PER_DAY),
          "tx_hash": str(entered["tx_hash"]),
        }
      )
  if not rows:
    return pd.DataFrame(columns=columns)
  return pd.DataFrame(rows)


def sales_timestamps_by_punk(sales: pd.DataFrame) -> dict[tuple[str, int], list[int]]:
  out: dict[tuple[str, int], list[int]] = {}
  if sales.empty:
    return out
  for row in sales.itertuples(index=False):
    out.setdefault((str(row.standard), int(row.punk_id)), []).append(int(row.timestamp))
  for timestamps in out.values():
    timestamps.sort()
  return out


def sale_cleared_between(
  sales_by_punk: dict[tuple[str, int], list[int]],
  standard: str,
  punk_id: int,
  start_ts: int,
  end_ts: int,
) -> bool:
  timestamps = sales_by_punk.get((standard, punk_id))
  if not timestamps:
    return False
  index = bisect.bisect_right(timestamps, start_ts)
  return index < len(timestamps) and timestamps[index] <= end_ts


def build_reservations(
  rejected: pd.DataFrame,
  *,
  standard: str,
  floor_eth: float | None,
  now_ts: int,
) -> dict[int, dict[str, Any]]:
  """Keep, per Punk, the most influential recent rejected bid. Influence is the
  bid size scaled by a recency-and-duration score, so a fleeting or stale bid
  cannot outweigh a sustained recent one even if it is nominally larger."""
  out: dict[int, dict[str, Any]] = {}
  if rejected.empty:
    return out
  subset = rejected[rejected["standard"] == standard]
  if subset.empty:
    return out
  floor_gate = max(RESERVATION_DUST_ETH, (floor_eth or 0.0) * RESERVATION_FLOOR_RATIO)
  best_influence: dict[int, float] = {}
  for row in subset.itertuples(index=False):
    eth = float(row.eth)
    if eth < floor_gate:
      continue
    age_days = max(0.0, (now_ts - int(row.cancel_ts)) / SECONDS_PER_DAY)
    recency = math.exp(-age_days / RESERVATION_RECENCY_DECAY_DAYS)
    if recency < RESERVATION_MIN_RECENCY:
      continue
    duration_factor = float(
      np.clip(float(row.duration_days) / RESERVATION_FULL_DURATION_DAYS, 0.0, 1.0)
    )
    score = recency * duration_factor
    if score < RESERVATION_MIN_SCORE:
      continue
    punk_id = int(row.punk_id)
    influence = eth * score
    if influence <= best_influence.get(punk_id, 0.0):
      continue
    best_influence[punk_id] = influence
    out[punk_id] = {
      "eth": eth,
      "wei": str(int(row.wei)),
      "timestamp": int(row.bid_ts),
      "txHash": str(row.tx_hash),
      "durationDays": float(row.duration_days),
      "score": float(score),
    }
  return out


def apply_reservation_band(
  fair_eth: float,
  low_eth: float,
  high_eth: float,
  reservation: dict[str, Any],
) -> tuple[float, float, float]:
  """Raise the valuation band toward a rejected bid without letting it dominate
  the sale comps: fair moves a bounded, score-weighted share toward the bid, the
  low band is lifted off the floor, and the high band only moves to stay above
  the others."""
  bid_eth = float(reservation["eth"])
  score = float(reservation["score"])
  fair_target = bid_eth * RESERVATION_FAIR_TARGET_MULT
  if fair_eth < fair_target:
    fair_eth = fair_eth + score * RESERVATION_FAIR_WEIGHT * (fair_target - fair_eth)
  low_target = bid_eth * RESERVATION_P10_TARGET_MULT * score
  low_cap = fair_eth * RESERVATION_MAX_LOW_FRACTION_OF_FAIR
  low_eth = max(low_eth, min(low_target, low_cap))
  high_eth = max(high_eth, fair_eth * 1.05, low_eth * 1.02)
  return fair_eth, low_eth, high_eth


def reservation_driver(reservation: dict[str, Any]) -> dict[str, Any]:
  return {
    "kind": "reservation_signal",
    "label": "Recent rejected high bid",
    "eth": float(reservation["eth"]),
    "timestamp": int(reservation["timestamp"]),
    "txHash": str(reservation["txHash"]),
    "durationDays": float(reservation["durationDays"]),
    "score": float(reservation["score"]),
  }


def reservation_metrics(
  rejected: pd.DataFrame,
  v2_reservations: dict[int, dict[str, Any]],
  v1_reservations: dict[int, dict[str, Any]],
) -> dict[str, Any]:
  def rejected_count(standard: str) -> int:
    if rejected.empty:
      return 0
    return int((rejected["standard"] == standard).sum())

  return {
    "rejectedBidsLoaded": int(len(rejected)),
    "v2RejectedBids": rejected_count("v2"),
    "v1RejectedBids": rejected_count("v1"),
    "v2PunksAdjusted": int(len(v2_reservations)),
    "v1PunksAdjusted": int(len(v1_reservations)),
    "recencyDecayDays": RESERVATION_RECENCY_DECAY_DAYS,
    "fullDurationDays": RESERVATION_FULL_DURATION_DAYS,
  }


def build_market_context(
  dataset: dict[str, pd.DataFrame],
  v2_sales: pd.DataFrame,
  v1_sales: pd.DataFrame,
) -> MarketContext:
  v2_floor = min_wei(dataset["v2_listings"], "value_wei")
  raw_v1_floor = min_wei(dataset["v1_listings"], "value_wei")
  v1_floor = credible_relative_floor(
    raw_v1_floor,
    v2_floor,
    listed_count=len(dataset["v1_listings"]),
    min_count=2,
    max_ratio=2.5,
  )
  v2_bid_floor = max_wei(dataset["v2_bids"], "value_wei")
  v1_bid_floor_native = max_wei(dataset["v1_bids"], "value_wei")
  market_bid_floor = max_wei(dataset["market_bids"], "bid_wei")
  v1_bid_floor = max_wei_values([v1_bid_floor_native, market_bid_floor])
  recent_cutoff = int(datetime.now(tz=UTC).timestamp()) - 30 * SECONDS_PER_DAY
  recent_v2 = v2_sales[v2_sales["timestamp"] >= recent_cutoff]
  recent_v1 = v1_sales[v1_sales["timestamp"] >= recent_cutoff]
  multiplier = v1_v2_multiplier(
    v2_floor_eth=wei_to_eth(v2_floor),
    v1_floor_eth=wei_to_eth(v1_floor),
    v2_bid_eth=wei_to_eth(v2_bid_floor),
    v1_bid_eth=wei_to_eth(v1_bid_floor),
    recent_v2_eth=recent_v2["eth"].to_numpy(dtype=float),
    recent_v1_eth=recent_v1["eth"].to_numpy(dtype=float),
    v1_listed_count=len(dataset["v1_listings"]),
  )
  context_json = {
    "v2FloorEth": wei_to_float_or_none(v2_floor),
    "v1FloorEth": wei_to_float_or_none(v1_floor),
    "rawV1FloorEth": wei_to_float_or_none(raw_v1_floor),
    "v1FloorIgnored": raw_v1_floor is not None and v1_floor is None,
    "publicV1NativeListingRecipients": [PUNKS_MARKET_ADDRESS],
    "v2BidFloorEth": wei_to_float_or_none(v2_bid_floor),
    "v1BidFloorEth": wei_to_float_or_none(v1_bid_floor),
    "recentWindowDays": 30,
    "v1V2MultiplierInputs": {
      "floorRatio": ratio_or_none(wei_to_eth(v1_floor), wei_to_eth(v2_floor)),
      "bidRatio": ratio_or_none(wei_to_eth(v1_bid_floor), wei_to_eth(v2_bid_floor)),
      "recentMedianRatio": ratio_or_none(
        median_or_none(recent_v1["eth"]),
        median_or_none(recent_v2["eth"]),
      ),
    },
  }
  return MarketContext(
    v2_floor_wei=v2_floor,
    v1_floor_wei=v1_floor,
    v2_bid_floor_wei=v2_bid_floor,
    v1_bid_floor_wei=v1_bid_floor,
    v2_listed_count=int(len(dataset["v2_listings"])),
    v1_listed_count=int(len(dataset["v1_listings"])),
    v2_active_bid_count=int(len(dataset["v2_bids"])),
    v1_active_bid_count=int(len(dataset["v1_bids"]) + len(dataset["market_bids"])),
    recent_v2_sales_count=int(len(recent_v2)),
    recent_v1_sales_count=int(len(recent_v1)),
    v1_v2_multiplier=multiplier,
    context_json=context_json,
  )


def v1_v2_multiplier(
  *,
  v2_floor_eth: float | None,
  v1_floor_eth: float | None,
  v2_bid_eth: float | None,
  v1_bid_eth: float | None,
  recent_v2_eth: np.ndarray,
  recent_v1_eth: np.ndarray,
  v1_listed_count: int = 0,
) -> float:
  ratios: list[tuple[float, float]] = []
  if v1_floor_eth and v2_floor_eth:
    ratios.append((v1_floor_eth / v2_floor_eth, 0.55))
  if v1_bid_eth and v2_bid_eth:
    ratios.append((v1_bid_eth / v2_bid_eth, 0.25))
  if len(recent_v1_eth) >= 2 and len(recent_v2_eth) >= 2:
    ratios.append((float(np.median(recent_v1_eth) / np.median(recent_v2_eth)), 0.20))
  if not ratios:
    return 1.0

  raw = sum(value * weight for value, weight in ratios) / sum(
    weight for _, weight in ratios
  )
  evidence_count = len(recent_v1_eth) + len(ratios) * 3 + min(v1_listed_count, 10)
  liquidity = min(1.0, evidence_count / 20.0)
  shrunk = 1.0 + liquidity * (raw - 1.0)
  return float(np.clip(shrunk, 0.05, 2.5))


def compute_trait_premiums(
  v2_sales: pd.DataFrame,
  trait_matrix: np.ndarray,
  *,
  premium_logs: np.ndarray | None = None,
) -> dict[int, dict[str, float | int]]:
  if v2_sales.empty:
    return {}
  if premium_logs is None:
    sale_logs = np.log(v2_sales["eth"].to_numpy(dtype=float))
  else:
    sale_logs = np.asarray(premium_logs, dtype=float)
    if len(sale_logs) != len(v2_sales):
      raise ValueError("premium_logs must align with v2_sales")
  finite_logs = np.isfinite(sale_logs)
  if not bool(finite_logs.any()):
    return {}
  global_median = float(np.median(sale_logs[finite_logs]))
  premiums: dict[int, dict[str, float | int]] = {}
  sale_punks = v2_sales["punk_id"].to_numpy(dtype=int)
  for trait_id in range(TRAIT_COUNT):
    has_trait = (trait_matrix[sale_punks, trait_id] > 0) & finite_logs
    count = int(has_trait.sum())
    if count == 0:
      continue
    raw = float(np.median(sale_logs[has_trait]) - global_median)
    shrink = count / (count + 12)
    premiums[trait_id] = {
      "traitId": trait_id,
      "saleCount": count,
      "logPremium": raw * shrink,
      "multiplier": float(math.exp(raw * shrink)),
    }
  return premiums


def trait_premium_training_data(
  dataset: dict[str, pd.DataFrame],
  v2_sales: pd.DataFrame,
  static: dict[str, Any],
) -> tuple[pd.DataFrame, np.ndarray]:
  if v2_sales.empty:
    return v2_sales, np.array([], dtype=float)
  supply = features.trait_supply(static["traits_by_punk"])
  built = features.build_training_frame(
    sales=v2_sales[["punk_id", "timestamp", "eth"]],
    listings=v2_listing_events(dataset["events"]),
    moves=dataset["moves"],
    bid_events=v2_bid_events(dataset["native_bids"]),
    traits_by_punk=static["traits_by_punk"],
    supply=supply,
    pixel_count=static["pixel_count"],
    color_count=static["color_count"],
  )
  frame = built["frame"]
  frame = frame[(frame["target_eth"] > 0.05) & (frame["target_eth"] < 100_000)].copy()
  if frame.empty:
    return pd.DataFrame(columns=["punk_id", "eth"]), np.array([], dtype=float)

  target = frame["target_eth"].to_numpy(dtype=float)
  floor = frame["floor"].to_numpy(dtype=float)
  med90 = frame["med90"].to_numpy(dtype=float)
  anchor = np.where(np.isfinite(floor) & (floor > 0), floor, med90)
  ok = np.isfinite(target) & (target > 0) & np.isfinite(anchor) & (anchor > 0)
  if not bool(ok.any()):
    return pd.DataFrame(columns=["punk_id", "eth"]), np.array([], dtype=float)

  sales = pd.DataFrame(
    {
      "punk_id": frame.loc[ok, "punk_id"].to_numpy(dtype=int),
      "eth": target[ok],
    }
  )
  return sales, np.log(target[ok]) - np.log(anchor[ok])


def _floor_model() -> HistGradientBoostingRegressor:
  return HistGradientBoostingRegressor(
    max_iter=400,
    learning_rate=0.05,
    max_leaf_nodes=31,
    min_samples_leaf=40,
    l2_regularization=1.0,
    early_stopping=False,
    random_state=RANDOM_STATE,
  )


def _snap(resid: np.ndarray) -> np.ndarray:
  return np.where(np.abs(resid) < PREMIUM_SNAP, 0.0, resid)


def train_price_model(
  dataset: dict[str, pd.DataFrame],
  v2_sales: pd.DataFrame,
  static: dict[str, Any],
  now_ts: int,
) -> dict[str, Any]:
  """Train the floor-relative premium model on point-in-time features of every
  historical V2 sale, then score all 10k Punks against the current market. The
  model predicts log(price/floor); we reattach the live floor, snap small
  premia, and attach split-conformal interval bands."""
  fallback_eth = (
    float(np.median(v2_sales["eth"].to_numpy(dtype=float)))
    if not v2_sales.empty
    else 1.0
  )
  supply = features.trait_supply(static["traits_by_punk"])
  built = features.build_training_frame(
    sales=v2_sales[["punk_id", "timestamp", "eth"]],
    listings=v2_listing_events(dataset["events"]),
    moves=dataset["moves"],
    bid_events=v2_bid_events(dataset["native_bids"]),
    traits_by_punk=static["traits_by_punk"],
    supply=supply,
    pixel_count=static["pixel_count"],
    color_count=static["color_count"],
  )
  frame = built["frame"]
  frame = frame[(frame["target_eth"] > 0.05) & (frame["target_eth"] < 100_000)]

  serving = features.build_serving_frame(
    now_ts=now_ts,
    current_floor=current_floor_map(dataset["v2_listings"]),
    current_bid=current_bid_map(dataset["v2_bids"]),
    index=built["index"],
    last_sale=built["last_sale"],
    traits_by_punk=static["traits_by_punk"],
    supply=supply,
    pixel_count=static["pixel_count"],
    color_count=static["color_count"],
  )

  if len(frame) < 200:
    predictions = np.full(PUNK_COUNT, fallback_eth, dtype=float)
    return {
      "kind": "baseline",
      "p10_model": predictions * 0.85,
      "p50_model": predictions,
      "p90_model": predictions * 1.25,
      "metrics": {"kind": "baseline", "testCount": 0},
      "baseline_metrics": {"medianEth": fallback_eth},
      "serving": serving,
    }

  trait_matrix = static["trait_matrix"]
  frame = frame.sort_values("ts").reset_index(drop=True)
  # Calibrate bands (and report metrics) on a recent out-of-sample window so the
  # calibration model nearly matches the served full-data model; fall back to an
  # 85/15 split if there is too little recent data.
  recent_mask = frame["ts"].to_numpy(dtype=np.int64) >= now_ts - INTERVAL_CALIBRATION_DAYS * SECONDS_PER_DAY
  if int(recent_mask.sum()) >= 50 and int((~recent_mask).sum()) >= 1000:
    fit, hold = frame[~recent_mask], frame[recent_mask]
  else:
    cut = int(len(frame) * 0.85)
    fit, hold = frame.iloc[:cut], frame.iloc[cut:]

  metrics = {"kind": "floor_relative_gbm", "testCount": 0}
  lo_q, hi_q = math.log(0.45), math.log(1.6)  # fallback band if no holdout
  if len(hold) >= 20:
    fitted = _fit_floor_model(fit, trait_matrix)
    x_hold, anchor_hold = features.design_matrix(hold, trait_matrix)
    resid_hold = fitted.predict(x_hold)
    pred_hold = np.exp(anchor_hold + _snap(resid_hold))
    actual_hold = hold["target_eth"].to_numpy(dtype=float)
    raw_err = np.log(actual_hold) - (anchor_hold + resid_hold)
    # Normalize the residual by the predicted-premium scale before taking the
    # global quantile, then re-apply the scale per Punk at serve. This widens the
    # band with premium (heteroscedastic) while borrowing the quantile from the
    # well-populated near-floor bulk rather than the thin premium tail. Centered
    # on the holdout median so bands sit symmetrically around the served p50.
    scale_hold = 1.0 + INTERVAL_PREMIUM_SCALE * np.maximum(0.0, _snap(resid_hold))
    ok_hold = np.isfinite(raw_err) & np.isfinite(scale_hold) & (scale_hold > 0)
    center = float(np.median(raw_err[ok_hold]))
    centered = (raw_err[ok_hold] - center) / scale_hold[ok_hold]
    lo_q = float(np.quantile(centered, (1 - INTERVAL_COVERAGE) / 2))
    hi_q = float(np.quantile(centered, 1 - (1 - INTERVAL_COVERAGE) / 2))
    metrics = floor_model_metrics(actual_hold, pred_hold, fit, hold)

  # Retrain on the full history for the served point estimate.
  model = _fit_floor_model(frame, trait_matrix)
  x_serve, anchor_serve = features.design_matrix(serving, trait_matrix)
  resid_serve = _snap(model.predict(x_serve))
  p50 = np.exp(anchor_serve + resid_serve)
  scale_serve = 1.0 + INTERVAL_PREMIUM_SCALE * np.maximum(0.0, resid_serve)
  p10 = p50 * np.exp(scale_serve * lo_q)
  p90 = p50 * np.exp(scale_serve * hi_q)
  # serving frame rows are punk_id 0..PUNK_COUNT-1 in order
  return {
    "kind": "floor_relative_gbm",
    "p10_model": p10,
    "p50_model": p50,
    "p90_model": p90,
    "metrics": metrics,
    "baseline_metrics": metrics.get("baseline", {}),
    "serving": serving,
  }


def _prob_model() -> HistGradientBoostingRegressor:
  # Squared-error regression on the 0/1 label yields well-calibrated P(sale).
  return HistGradientBoostingRegressor(
    max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
    min_samples_leaf=80, l2_regularization=1.0,
    early_stopping=False, random_state=RANDOM_STATE,
  )


def _roc_auc(y: np.ndarray, p: np.ndarray) -> float | None:
  order = np.argsort(p, kind="mergesort")
  ranks = np.empty(len(p), dtype=float)
  ranks[order] = np.arange(1, len(p) + 1)
  n1 = float(y.sum())
  n0 = float(len(y) - n1)
  if n0 == 0 or n1 == 0:
    return None
  return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n0 * n1))


def train_sale_probability(
  dataset: dict[str, pd.DataFrame],
  v2_sales: pd.DataFrame,
  static: dict[str, Any],
  now_ts: int,
) -> dict[str, Any] | None:
  """Train a calibrated P(sale within 24h | listed) classifier on every
  historical public listing snapshot, plus the current liquidity needed to score
  all Punks at serve time. Returns None when there is too little data."""
  supply = features.trait_supply(static["traits_by_punk"])
  frame = features.build_listing_training_frame(
    sales=v2_sales[["punk_id", "timestamp", "eth"]],
    listings=v2_listing_events(dataset["events"]),
    moves=dataset["moves"],
    bid_events=v2_bid_events(dataset["native_bids"]),
    traits_by_punk=static["traits_by_punk"],
    supply=supply,
  )
  frame = frame[np.isfinite(frame["ask_ratio"].to_numpy(dtype=float))]
  if len(frame) < 2000:
    return None
  frame = frame.sort_values("ts").reset_index(drop=True)
  cut = int(len(frame) * 0.85)
  fit, hold = frame.iloc[:cut], frame.iloc[cut:]
  x_fit, x_hold, x_all = (
    features.prob_design(fit), features.prob_design(hold), features.prob_design(frame)
  )

  # One calibrated classifier per horizon (24h / 7d / 30d).
  classifiers: dict[str, Any] = {}
  horizons: dict[str, Any] = {}
  for label in features.PROB_HORIZONS:
    y_all = frame[label].to_numpy(dtype=float)
    stats: dict[str, Any] = {"baseRate": float(y_all.mean())}
    if len(hold) >= 200:
      holdout = _prob_model().fit(x_fit, fit[label].to_numpy(dtype=float))
      p = np.clip(holdout.predict(x_hold), 0.0, 1.0)
      y = hold[label].to_numpy(dtype=float)
      stats.update({"auc": _roc_auc(y, p), "brier": float(np.mean((p - y) ** 2))})
    classifiers[label] = _prob_model().fit(x_all, y_all)
    horizons[label] = stats

  ts = v2_sales["timestamp"].to_numpy(dtype=np.int64)
  eth = v2_sales["eth"].to_numpy(dtype=float)
  m30 = np.median(eth[(ts >= now_ts - 30 * SECONDS_PER_DAY) & (ts < now_ts)]) if (ts >= now_ts - 30 * SECONDS_PER_DAY).any() else np.nan
  m90 = np.median(eth[(ts >= now_ts - 90 * SECONDS_PER_DAY) & (ts < now_ts)]) if (ts >= now_ts - 90 * SECONDS_PER_DAY).any() else np.nan
  listing_prices = np.sort(np.array(list(current_floor_map(dataset["v2_listings"]).values()), dtype=float))
  return {
    "classifiers": classifiers,
    "supply": supply,
    "sales_7d": int(((ts >= now_ts - 7 * SECONDS_PER_DAY) & (ts < now_ts)).sum()),
    "sales_30d": int(((ts >= now_ts - 30 * SECONDS_PER_DAY) & (ts < now_ts)).sum()),
    "active_listings": int(len(listing_prices)),
    "listing_prices": listing_prices,
    "floor_mom": float(m30 / m90) if (m30 == m30 and m90 == m90 and m90 > 0) else 1.0,
    "metrics": {"kind": "sale_prob_gbm", "trainRows": int(len(fit)), "horizons": horizons},
  }


def _fit_floor_model(
  frame: pd.DataFrame, trait_matrix: np.ndarray
) -> HistGradientBoostingRegressor:
  x, anchor = features.design_matrix(frame, trait_matrix)
  target = frame["target_eth"].to_numpy(dtype=float)
  y = np.log(target) - anchor
  ok = np.isfinite(y) & np.isfinite(x).all(axis=1)
  weights = np.power(np.maximum(target, 1e-6), VALUE_WEIGHT)[ok]
  return _floor_model().fit(x[ok], y[ok], sample_weight=weights)


def floor_model_metrics(
  actual: np.ndarray,
  predicted: np.ndarray,
  fit: pd.DataFrame,
  hold: pd.DataFrame,
) -> dict[str, Any]:
  mask = (actual > 0) & np.isfinite(predicted) & (predicted > 0)
  a, p = actual[mask], predicted[mask]
  baseline_eth = float(np.median(fit["target_eth"].to_numpy(dtype=float)))
  baseline = np.full_like(a, baseline_eth)
  order = np.argsort(a)
  tail = order[int(0.9 * len(a)):]
  return {
    "kind": "floor_relative_gbm",
    "testCount": int(len(a)),
    "medianAbsolutePercentError": median_ape(a, p),
    "medianAbsoluteLogError": float(np.median(np.abs(np.log(p / a)))),
    "valueWeightedError": float(np.sum(np.abs(p - a)) / np.sum(a)),
    "tailMedianAbsolutePercentError": float(np.median(np.abs(p[tail] - a[tail]) / a[tail])),
    "valueWeight": VALUE_WEIGHT,
    "baseline": {
      "medianEth": baseline_eth,
      "medianAbsolutePercentError": median_ape(a, baseline),
    },
  }


def v2_listing_events(events: pd.DataFrame) -> pd.DataFrame:
  """Listing/cancel events for the V2 marketplace, shaped for the floor sweep."""
  cols = ["punk_id", "type", "ts", "price", "only_sell_to"]
  if events.empty:
    return pd.DataFrame(columns=cols)
  rows = events[
    (events["source"] == "cryptopunks_v2")
    & (events["type"].isin(["listing", "listing_cancelled"]))
  ]
  out = pd.DataFrame(
    {
      "punk_id": rows["punk_id"].to_numpy(dtype=int),
      "type": rows["type"].to_numpy(),
      "ts": rows["timestamp"].to_numpy(dtype=np.int64),
      "price": [
        (float(Decimal(w) / WEI_PER_ETH) if w not in (None, "") and not pd.isna(w) else float("nan"))
        for w in rows["listing_wei"].tolist()
      ],
      "only_sell_to": rows["only_sell_to"].tolist(),
    }
  )
  return out


def v2_bid_events(native_bids: pd.DataFrame) -> pd.DataFrame:
  cols = ["punk_id", "type", "ts", "eth"]
  if native_bids.empty:
    return pd.DataFrame(columns=cols)
  rows = native_bids[native_bids["source"] == "cryptopunks_v2"]
  return pd.DataFrame(
    {
      "punk_id": rows["punk_id"].to_numpy(dtype=int),
      "type": rows["type"].to_numpy(),
      "ts": rows["timestamp"].to_numpy(dtype=np.int64),
      "eth": [
        (float(Decimal(w) / WEI_PER_ETH) if w not in (None, "") and not pd.isna(w) else 0.0)
        for w in rows["wei_amount"].tolist()
      ],
    }
  )


def current_floor_map(v2_listings: pd.DataFrame) -> dict[int, float]:
  out: dict[int, float] = {}
  for r in v2_listings.itertuples(index=False):
    eth = wei_to_eth(r.value_wei)
    if eth and eth > 0:
      out[int(r.punk_id)] = eth
  return out


def current_bid_map(v2_bids: pd.DataFrame) -> dict[int, float]:
  out: dict[int, float] = {}
  for r in v2_bids.itertuples(index=False):
    eth = wei_to_eth(r.value_wei)
    if eth and eth > 0:
      out[int(r.punk_id)] = eth
  return out


def predict_v2(
  *,
  model: dict[str, Any],
  static: dict[str, Any],
  market: MarketContext,
  trait_premiums: dict[int, dict[str, float | int]],
  comps_index: dict[int, list[dict[str, Any]]],
  current_bids: pd.DataFrame,
  reservations: dict[int, dict[str, Any]],
  sale_prob_model: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  # The floor-relative model already produces floor-aware, conformal-calibrated
  # bands per Punk; use them directly (no serve-time market rescale or comp
  # blend — the model consumes the live floor and trait comps as features).
  p10 = model["p10_model"].astype(float)
  p50 = model["p50_model"].astype(float)
  p90 = model["p90_model"].astype(float)
  best_bids = bids_by_punk(current_bids)
  floor_eth = wei_to_eth(market.v2_floor_wei)
  market_context = {
    "standard": "v2",
    "model": model.get("kind", "floor_relative_gbm"),
    "floorWei": market.v2_floor_wei,
    "bidFloorWei": market.v2_bid_floor_wei,
  }

  # Pass 1: per-Punk valuation band, quick-sale price, and active bid.
  records: list[dict[str, Any]] = []
  for punk_id in range(PUNK_COUNT):
    fair = float(p50[punk_id])
    low = float(p10[punk_id])
    high = float(p90[punk_id])
    reservation = reservations.get(punk_id)
    if reservation:
      fair, low, high = apply_reservation_band(fair, low, high, reservation)
    best_bid_eth = wei_to_eth(best_bids.get(punk_id))
    quick = min(fair, max(best_bid_eth or 0.0, low * 0.98))
    records.append(
      {"punk_id": punk_id, "fair": fair, "low": low, "high": high,
       "quick": quick, "best_bid_eth": best_bid_eth, "reservation": reservation}
    )

  # Sale probability: calibrated classifiers (24h / 7d / 30d) on the quick-sale
  # ask vs floor / cohort / own-last, the standing bid, and current liquidity;
  # the 24h horizon falls back to the heuristic when there is no model.
  serving = model.get("serving")
  cohort_meds = serving["cohort_med"].to_numpy(dtype=float) if serving is not None else None
  own_lasts = serving["own_last"].to_numpy(dtype=float) if serving is not None else None
  horizon_probs = sale_probabilities(
    records, floor_eth, static, sale_prob_model, cohort_meds, own_lasts
  )
  prob_24h = horizon_probs["sold24h"]

  out: list[dict[str, Any]] = []
  for idx, rec in enumerate(records):
    punk_id = rec["punk_id"]
    probability = float(prob_24h[idx])
    comps = comps_index.get(punk_id, [])
    confidence = confidence_for(comps, market.recent_v2_sales_count)
    trait_drivers = top_trait_premiums(static["traits_by_punk"][punk_id], trait_premiums)
    drivers = prediction_drivers(
      floor_eth=floor_eth,
      best_bid_eth=rec["best_bid_eth"],
      fair_eth=rec["fair"],
      trait_drivers=trait_drivers,
      comps=comps,
      reservation=rec["reservation"],
    )
    if len(horizon_probs) > 1:
      drivers.append(
        {
          "kind": "sale_probability",
          "label": "Sale probability by horizon",
          "day1": probability,
          "day7": float(horizon_probs["sold_7d"][idx]),
          "day30": float(horizon_probs["sold_30d"][idx]),
        }
      )
    out.append(
      prediction_row(
        standard="v2",
        punk_id=punk_id,
        quick_eth=rec["quick"],
        fair_eth=rec["fair"],
        p10_eth=rec["low"],
        p50_eth=rec["fair"],
        p90_eth=rec["high"],
        probability=probability,
        confidence=confidence,
        drivers=drivers,
        comps=comps[:5],
        trait_premiums=trait_drivers,
        market_context=market_context,
      )
    )
  return out


def sale_probabilities(
  records: list[dict[str, Any]],
  floor_eth: float | None,
  static: dict[str, Any],
  sale_prob_model: dict[str, Any] | None,
  cohort_meds: np.ndarray | None = None,
  own_lasts: np.ndarray | None = None,
) -> dict[str, np.ndarray]:
  """Per-horizon P(sale) arrays keyed by the label (sold24h/sold_7d/sold_30d).
  Without a model only the 24h horizon is returned, via the heuristic."""
  if sale_prob_model is None or not floor_eth or floor_eth <= 0:
    return {
      "sold24h": np.array([
        sale_probability_heuristic(r["quick"], r["fair"], r["best_bid_eth"])
        for r in records
      ])
    }
  supply = sale_prob_model["supply"]
  traits_by_punk = static["traits_by_punk"]
  listing_prices = sale_prob_model.get("listing_prices")
  n_listings = len(listing_prices) if listing_prices is not None else 0
  floor_mom = sale_prob_model.get("floor_mom", 1.0)
  rows = []
  for r in records:
    quick = r["quick"]
    ask_pct = float(np.searchsorted(listing_prices, quick) / n_listings) if n_listings else 0.5
    rows.append(
      features.prob_row(
        r["punk_id"], quick, floor_eth, r["best_bid_eth"] or float("nan"),
        sale_prob_model["active_listings"], sale_prob_model["sales_7d"],
        sale_prob_model["sales_30d"], supply, traits_by_punk,
        cohort_med=float(cohort_meds[r["punk_id"]]) if cohort_meds is not None else float("nan"),
        own_last=float(own_lasts[r["punk_id"]]) if own_lasts is not None else float("nan"),
        ask_percentile=ask_pct, floor_mom=floor_mom,
      )
    )
  design = features.prob_design(pd.DataFrame(rows, columns=features.PROB_FEATURES))
  return {
    label: np.clip(clf.predict(design), 0.02, 0.98)
    for label, clf in sale_prob_model["classifiers"].items()
  }


def predict_v1(
  *,
  v2_predictions: list[dict[str, Any]],
  market: MarketContext,
  current_bids: pd.DataFrame,
  market_bids: pd.DataFrame,
  static: dict[str, Any],
  reservations: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
  best_bids = bids_by_punk(current_bids)
  for punk_id, bid_wei in matching_market_bids_by_punk(market_bids, static).items():
    existing = parse_wei(best_bids.get(punk_id))
    bid = parse_wei(bid_wei)
    if bid is not None and (existing is None or bid > existing):
      best_bids[punk_id] = str(bid)
  multiplier = market.v1_v2_multiplier
  floor_eth = wei_to_eth(market.v1_floor_wei)
  market_context = {
    "standard": "v1",
    "floorWei": market.v1_floor_wei,
    "bidFloorWei": market.v1_bid_floor_wei,
    "v1V2Multiplier": multiplier,
    "strategy": "same-punk v2 value adjusted by current V1/V2 liquidity",
  }
  out: list[dict[str, Any]] = []
  for base in v2_predictions:
    punk_id = int(base["punk_id"])
    fair = wei_to_float(base["fair_value_wei"]) * multiplier
    low = wei_to_float(base["p10_sale_wei"]) * multiplier
    high = wei_to_float(base["p90_sale_wei"]) * multiplier
    if floor_eth:
      fair = max(fair, floor_eth * 0.85)
    reservation = reservations.get(punk_id)
    if reservation:
      fair, low, high = apply_reservation_band(fair, low, high, reservation)
    best_bid_eth = wei_to_eth(best_bids.get(punk_id))
    quick = min(fair, max(best_bid_eth or 0.0, low * 0.98))
    probability = sale_probability_heuristic(quick, fair, best_bid_eth)
    confidence = "medium" if market.recent_v1_sales_count >= 5 else "low"
    # The inherited V2 reservation driver is quoted at V2 scale, so drop it and
    # surface only this Punk's own V1 native rejected bid (if any).
    inherited = [
      driver
      for driver in base["drivers_json"]
      if driver.get("kind") != "reservation_signal"
    ][:4]
    drivers = [
      {
        "kind": "v1_v2_multiplier",
        "label": "V1/V2 market adjustment",
        "value": multiplier,
      },
    ]
    if reservation:
      drivers.append(reservation_driver(reservation))
    drivers.extend(inherited)
    out.append(
      prediction_row(
        standard="v1",
        punk_id=punk_id,
        quick_eth=quick,
        fair_eth=fair,
        p10_eth=low,
        p50_eth=fair,
        p90_eth=high,
        probability=probability,
        confidence=confidence,
        drivers=drivers,
        comps=base["comps_json"],
        trait_premiums=base["trait_premiums_json"],
        market_context=market_context,
      )
    )
  return out


def prediction_row(
  *,
  standard: str,
  punk_id: int,
  quick_eth: float,
  fair_eth: float,
  p10_eth: float,
  p50_eth: float,
  p90_eth: float,
  probability: float,
  confidence: str,
  drivers: list[dict[str, Any]],
  comps: list[dict[str, Any]],
  trait_premiums: list[dict[str, Any]],
  market_context: dict[str, Any],
) -> dict[str, Any]:
  p10_eth, p50_eth, p90_eth = ordered_three(p10_eth, p50_eth, p90_eth)
  quick_eth = max(0.000001, min(quick_eth, p90_eth))
  return {
    "standard": standard,
    "punk_id": punk_id,
    "quick_sale_wei": eth_to_wei_string(quick_eth),
    "fair_value_wei": eth_to_wei_string(fair_eth),
    "p10_sale_wei": eth_to_wei_string(p10_eth),
    "p50_sale_wei": eth_to_wei_string(p50_eth),
    "p90_sale_wei": eth_to_wei_string(p90_eth),
    "sale_probability_24h": float(np.clip(probability, 0.0, 1.0)),
    "confidence": confidence,
    "drivers_json": drivers,
    "comps_json": comps,
    "trait_premiums_json": trait_premiums,
    "market_context_json": market_context,
  }


def build_comps_index(
  v2_sales: pd.DataFrame,
  traits_by_punk: list[list[int]],
) -> dict[int, list[dict[str, Any]]]:
  if v2_sales.empty:
    return {}
  now_ts = int(datetime.now(tz=UTC).timestamp())
  recent_cutoff = now_ts - 365 * SECONDS_PER_DAY
  recent = v2_sales[v2_sales["timestamp"] >= recent_cutoff].copy()
  if recent.empty:
    recent = v2_sales.sort_values("timestamp").tail(500).copy()

  # Market level at any time = trailing-90d sale median. Used to restate each
  # comp's old nominal price into today's market so it is comparable to the
  # current fair value (an 11-month-old sale at a different floor misleads).
  history = v2_sales.sort_values("timestamp")
  level_ts = history["timestamp"].to_numpy(dtype=np.int64)
  level_eth = history["eth"].to_numpy(dtype=float)

  def market_level(at_ts: int) -> float | None:
    lo = np.searchsorted(level_ts, at_ts - 90 * SECONDS_PER_DAY, side="left")
    hi = np.searchsorted(level_ts, at_ts, side="right")
    if hi <= lo:
      return None
    return float(np.median(level_eth[lo:hi]))

  current_level = market_level(now_ts) or (
    float(np.median(level_eth)) if len(level_eth) else None
  )

  trait_supply: dict[int, int] = {}
  for traits in traits_by_punk:
    for trait_id in traits:
      trait_supply[trait_id] = trait_supply.get(trait_id, 0) + 1

  sales_by_trait: dict[int, list[dict[str, Any]]] = {}
  for row in recent.sort_values("timestamp", ascending=False).itertuples(index=False):
    sale_traits = traits_by_punk[int(row.punk_id)]
    sale_eth = float(row.eth)
    then_level = market_level(int(row.timestamp))
    adjusted_eth = sale_eth
    if current_level and then_level and then_level > 0:
      # restate to today's market, clamped so a thin-data ratio can't run wild
      ratio = min(5.0, max(0.2, current_level / then_level))
      adjusted_eth = sale_eth * ratio
    sale = {
      "punkId": int(row.punk_id),
      "eth": sale_eth,
      "marketAdjustedEth": adjusted_eth,
      "wei": str(row.wei),
      "timestamp": int(row.timestamp),
      "source": str(row.source),
      "txHash": str(row.tx_hash),
    }
    for trait_id in sale_traits:
      sales_by_trait.setdefault(trait_id, []).append(sale)

  comps: dict[int, list[dict[str, Any]]] = {}
  for punk_id, traits in enumerate(traits_by_punk):
    rare_traits = sorted(traits, key=lambda trait: trait_supply.get(trait, PUNK_COUNT))[:4]
    seen: set[tuple[int, int]] = set()
    punk_comps: list[dict[str, Any]] = []
    for trait_id in rare_traits:
      for sale in sales_by_trait.get(trait_id, [])[:30]:
        key = (int(sale["punkId"]), int(sale["timestamp"]))
        if int(sale["punkId"]) == punk_id or key in seen:
          continue
        seen.add(key)
        punk_comps.append({**sale, "matchedTraitId": trait_id})
        if len(punk_comps) >= 8:
          break
      if len(punk_comps) >= 8:
        break
    if punk_comps:
      comps[punk_id] = punk_comps
  return comps


def top_trait_premiums(
  traits: Iterable[int],
  premiums: dict[int, dict[str, float | int]],
) -> list[dict[str, Any]]:
  by_name: dict[str, dict[str, Any]] = {}
  for trait_id in traits:
    premium = premiums.get(trait_id)
    if not premium:
      continue
    log_premium = float(premium["logPremium"])
    multiplier = float(premium["multiplier"])
    if log_premium <= 0 or multiplier <= 1.0:
      continue
    name = display_trait_name(trait_id)
    if name is None:
      continue
    row = {
      "traitId": trait_id,
      "traitName": name,
      "saleCount": int(premium["saleCount"]),
      "multiplier": multiplier,
      "logPremium": log_premium,
    }
    current = by_name.get(name)
    if current is None or log_premium > float(current["logPremium"]):
      by_name[name] = row
  return sorted(
    by_name.values(), key=lambda row: float(row["logPremium"]), reverse=True
  )[:6]


def prediction_drivers(
  *,
  floor_eth: float | None,
  best_bid_eth: float | None,
  fair_eth: float,
  trait_drivers: list[dict[str, Any]],
  comps: list[dict[str, Any]],
  reservation: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
  drivers: list[dict[str, Any]] = []
  if reservation:
    drivers.append(reservation_driver(reservation))
  if floor_eth:
    drivers.append(
      {
        "kind": "floor",
        "label": "Current floor",
        "eth": floor_eth,
        "ratioToFair": floor_eth / fair_eth if fair_eth > 0 else None,
      }
    )
  if best_bid_eth:
    drivers.append(
      {
        "kind": "bid",
        "label": "Best matching native bid",
        "eth": best_bid_eth,
      }
    )
  if comps:
    drivers.append(
      {
        "kind": "comps",
        "label": "Recent similar sales",
        "count": len(comps),
        "medianEth": median_or_none([comp["eth"] for comp in comps]),
        "marketAdjustedMedianEth": median_or_none(
          [comp.get("marketAdjustedEth", comp["eth"]) for comp in comps]
        ),
      }
    )
  for trait in trait_drivers[:3]:
    trait_name = str(
      trait.get("traitName", trait_name_for_id(int(trait["traitId"])))
    )
    drivers.append(
      {
        "kind": "trait",
        **trait,
        "label": f"{trait_name} premium",
      }
    )
  return drivers


def bids_by_punk(bids: pd.DataFrame) -> dict[int, str]:
  out: dict[int, str] = {}
  if bids.empty:
    return out
  for row in bids.itertuples(index=False):
    punk_id = int(row.punk_id)
    wei = parse_wei(row.value_wei)
    if wei is None:
      continue
    current = parse_wei(out.get(punk_id))
    if current is None or wei > current:
      out[punk_id] = str(wei)
  return out


def matching_market_bids_by_punk(
  bids: pd.DataFrame,
  static: dict[str, Any],
) -> dict[int, str]:
  out: dict[int, str] = {}
  if bids.empty:
    return out
  trait_masks: list[int] = static["trait_masks"]
  color_masks: list[int] = static["color_masks"]
  pixel_count: np.ndarray = static["pixel_count"]
  color_count: np.ndarray = static["color_count"]
  for bid in bids.itertuples(index=False):
    bid_wei = parse_wei(bid.bid_wei)
    if bid_wei is None or bid_wei <= 0:
      continue
    required_trait = int(bid.required_trait_mask)
    forbidden_trait = int(bid.forbidden_trait_mask)
    any_trait = int(bid.any_of_trait_mask)
    required_color = int(bid.required_color_mask)
    forbidden_color = int(bid.forbidden_color_mask)
    any_color = int(bid.any_of_color_mask)
    include_ids = parse_id_json(bid.include_ids_json)
    exclude_ids = parse_id_json(bid.exclude_ids_json)
    candidates = include_ids if bool(bid.has_include_ids) else range(PUNK_COUNT)
    excluded = set(exclude_ids)
    for punk_id in candidates:
      if punk_id in excluded or not 0 <= punk_id < PUNK_COUNT:
        continue
      trait_mask = trait_masks[punk_id]
      color_mask = color_masks[punk_id]
      if (trait_mask & required_trait) != required_trait:
        continue
      if trait_mask & forbidden_trait:
        continue
      if any_trait and not (trait_mask & any_trait):
        continue
      if (color_mask & required_color) != required_color:
        continue
      if color_mask & forbidden_color:
        continue
      if any_color and not (color_mask & any_color):
        continue
      if int(pixel_count[punk_id]) < int(bid.min_pixel_count):
        continue
      if int(pixel_count[punk_id]) > int(bid.max_pixel_count):
        continue
      if int(color_count[punk_id]) < int(bid.min_color_count):
        continue
      if int(color_count[punk_id]) > int(bid.max_color_count):
        continue
      existing = parse_wei(out.get(punk_id))
      if existing is None or bid_wei > existing:
        out[punk_id] = str(bid_wei)
  return out


def active_model_errors(conn: Connection) -> tuple[bool, float | None, float | None]:
  """(has_incumbent, incumbent medAPE, incumbent WAPE) from the active run."""
  row = conn.execute(
    """
    SELECT metrics_json
    FROM offchain.prediction_model_runs
    WHERE active = true
    LIMIT 1
    """
  ).fetchone()
  if row is None:
    return False, None, None
  metrics = row["metrics_json"] if isinstance(row, dict) else row[0]
  model = metrics.get("model", {}) if isinstance(metrics, dict) else {}

  def num(key: str) -> float | None:
    value = model.get(key)
    return float(value) if isinstance(value, (int, float)) else None

  return True, num("medianAbsolutePercentError"), num("valueWeightedError")


def decide_promotion(conn: Connection, run: PredictionRun) -> dict[str, Any]:
  model_metrics = run.metrics.get("model", {})
  baseline_metrics = model_metrics.get("baseline", {})
  reservation = run.metrics.get("reservation", {})
  has_incumbent, incumbent_ape, incumbent_wape = active_model_errors(conn)
  punks_adjusted = int(reservation.get("v2PunksAdjusted", 0)) + int(
    reservation.get("v1PunksAdjusted", 0)
  )
  return promotion_decision(
    model_ape=model_metrics.get("medianAbsolutePercentError"),
    baseline_ape=baseline_metrics.get("medianAbsolutePercentError"),
    incumbent_ape=incumbent_ape,
    has_incumbent=has_incumbent,
    has_reservation_signal=punks_adjusted > 0,
    model_wape=model_metrics.get("valueWeightedError"),
    incumbent_wape=incumbent_wape,
  )


def promotion_decision(
  *,
  model_ape: float | None,
  baseline_ape: float | None,
  incumbent_ape: float | None,
  has_incumbent: bool,
  has_reservation_signal: bool = False,
  model_wape: float | None = None,
  incumbent_wape: float | None = None,
) -> dict[str, Any]:
  decision: dict[str, Any] = {
    "modelMedianApe": model_ape,
    "baselineMedianApe": baseline_ape,
    "incumbentMedianApe": incumbent_ape,
    "modelWape": model_wape,
    "incumbentWape": incumbent_wape,
    "regressionTolerance": PROMOTION_REGRESSION_TOLERANCE,
    "hasReservationSignal": has_reservation_signal,
  }
  if not has_incumbent:
    return {**decision, "promote": True, "reason": "bootstrap: no active model"}
  if model_ape is None:
    return {**decision, "promote": False, "reason": "no holdout evaluation (testCount=0)"}
  beats_baseline = baseline_ape is None or model_ape <= baseline_ape
  # The median-sale baseline rewards regressing toward the global median, which
  # the reservation signal deliberately does not. So a reservation-signal run is
  # allowed past the baseline gate as long as it still holds versus the active
  # model; runs without that signal must still beat the baseline.
  if not beats_baseline and not has_reservation_signal:
    return {**decision, "promote": False, "reason": "does not beat the median baseline"}
  # Judge regression versus the incumbent on WAPE (value-weighted error) — the
  # metric the model optimizes and the one that reflects expensive-Punk accuracy.
  # medAPE is floor-dominated and swings ~13% run-to-run on noise (WAPE ~2%), so
  # gating on it lets a lucky-low-medAPE incumbent lock out equal-or-better runs
  # and go stale. Fall back to medAPE only when WAPE is unavailable (older runs).
  if model_wape is not None and incumbent_wape is not None:
    regresses = model_wape > incumbent_wape * (1.0 + PROMOTION_REGRESSION_TOLERANCE)
    metric = "WAPE"
  else:
    regresses = (
      incumbent_ape is not None
      and model_ape > incumbent_ape * (1.0 + PROMOTION_REGRESSION_TOLERANCE)
    )
    metric = "medAPE"
  if regresses:
    return {
      **decision,
      "promote": False,
      "reason": f"regresses versus the active model ({metric})",
    }
  if not beats_baseline:
    return {
      **decision,
      "promote": True,
      "reason": "reservation-signal run holds versus the active model (baseline gate waived)",
    }
  return {
    **decision,
    "promote": True,
    "reason": "beats baseline and holds versus the active model",
  }


def realized_backtest(conn: Connection, dataset: dict[str, pd.DataFrame]) -> dict[str, Any]:
  """Score every public V2 sale in the trailing REALIZED_WINDOW_DAYS against the
  prediction that was actually live when it sold — the promoted run with the
  greatest trained_at <= the sale time. Leakage-free by construction (predictions
  predate the sales) and aggregated across the frequent promotions into one
  stable in-production accuracy number. Best effort: any failure yields an empty
  result rather than blocking the training run."""
  empty = {"kind": "live_realized", "n": 0, "windowDays": REALIZED_WINDOW_DAYS}
  try:
    now_ts = int(utc_now().timestamp())
    since = now_ts - REALIZED_WINDOW_DAYS * SECONDS_PER_DAY
    # Runs that were ever live, oldest -> newest (a rejected run never served).
    promoted = conn.execute(
      "SELECT run_id, trained_at FROM offchain.prediction_model_runs "
      "WHERE (metrics_json->'promotion'->>'promote')::boolean = true "
      "ORDER BY trained_at"
    ).fetchall()
    if not promoted:
      return empty
    run_ids = [str(r["run_id"]) for r in promoted]
    run_ts = np.array([int(r["trained_at"].timestamp()) for r in promoted], dtype=np.int64)
    sales = normalize_sales(dataset["events"])
    sales = sales[
      (sales["standard"] == "v2")
      & (sales["timestamp"] >= since)
      & (sales["timestamp"] <= now_ts)
    ]
    if sales.empty:
      return empty
    # Map each sale to the run live at its time, and collect the (run, punk) pairs.
    needed: dict[str, set[int]] = {}
    sale_run: list[str | None] = []
    for sale in sales.itertuples(index=False):
      idx = int(np.searchsorted(run_ts, int(sale.timestamp), side="right")) - 1
      if idx < 0:
        sale_run.append(None)
        continue
      run_id = run_ids[idx]
      sale_run.append(run_id)
      needed.setdefault(run_id, set()).add(int(sale.punk_id))
    preds: dict[tuple[str, int], dict[str, Any]] = {}
    for run_id, punk_ids in needed.items():
      rows = conn.execute(
        "SELECT punk_id, fair_value_wei, p10_sale_wei, p90_sale_wei, sale_probability_24h "
        "FROM offchain.punk_predictions WHERE run_id = %s AND standard = 'v2' "
        "AND punk_id = ANY(%s)",
        (run_id, list(punk_ids)),
      ).fetchall()
      for row in rows:
        preds[(run_id, int(row["punk_id"]))] = row
    apes: list[float] = []
    in_band: list[float] = []
    probs: list[float] = []
    abs_err_sum = 0.0
    abs_act_sum = 0.0
    for sale, run_id in zip(sales.itertuples(index=False), sale_run):
      if run_id is None:
        continue
      pred = preds.get((run_id, int(sale.punk_id)))
      if pred is None:
        continue
      fair_wei = parse_wei(pred["fair_value_wei"])
      if fair_wei is None or fair_wei <= 0:
        continue
      fair_eth = fair_wei / 1e18
      actual_eth = float(sale.eth)
      actual_wei = int(sale.wei)
      apes.append(abs(fair_eth - actual_eth) / actual_eth)
      abs_err_sum += abs(fair_eth - actual_eth)
      abs_act_sum += actual_eth
      low_wei = parse_wei(pred["p10_sale_wei"])
      high_wei = parse_wei(pred["p90_sale_wei"])
      if low_wei is not None and high_wei is not None:
        in_band.append(1.0 if low_wei <= actual_wei <= high_wei else 0.0)
      if pred["sale_probability_24h"] is not None:
        probs.append(float(pred["sale_probability_24h"]))
    if not apes:
      return empty
    return {
      "kind": "live_realized",
      "windowDays": REALIZED_WINDOW_DAYS,
      "runsScored": len(needed),
      "n": len(apes),
      "medianAbsolutePercentError": float(np.median(apes)),
      "valueWeightedError": float(abs_err_sum / abs_act_sum) if abs_act_sum > 0 else None,
      "intervalCoverage": float(np.mean(in_band)) if in_band else None,
      "medianSaleProbability24hOfSold": float(np.median(probs)) if probs else None,
    }
  except Exception as exc:  # never block a training run on the backtest
    return {**empty, "error": str(exc)}


def store_prediction_run(conn: Connection, run: PredictionRun) -> dict[str, Any]:
  with conn.transaction():
    decision = decide_promotion(conn, run)
    run.metrics["promotion"] = decision
    conn.execute(
      """
      INSERT INTO offchain.prediction_model_runs (
        run_id, model_version, status, active, trained_at, data_cutoff,
        training_started_at, training_finished_at, metrics_json, config_json
      )
      VALUES (%s, %s, 'superseded', false, %s, %s, %s, %s, %s, %s)
      """,
      (
        run.run_id,
        run.model_version,
        run.trained_at,
        run.data_cutoff,
        run.training_started_at,
        run.training_finished_at,
        Jsonb(run.metrics),
        Jsonb(run.config),
      ),
    )
    conn.execute(
      """
      INSERT INTO offchain.prediction_market_context (
        run_id, v2_floor_wei, v1_floor_wei, v2_bid_floor_wei, v1_bid_floor_wei,
        v2_listed_count, v1_listed_count, v2_active_bid_count, v1_active_bid_count,
        recent_v2_sales_count, recent_v1_sales_count, v1_v2_multiplier,
        context_json, generated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        run.run_id,
        run.market_context.v2_floor_wei,
        run.market_context.v1_floor_wei,
        run.market_context.v2_bid_floor_wei,
        run.market_context.v1_bid_floor_wei,
        run.market_context.v2_listed_count,
        run.market_context.v1_listed_count,
        run.market_context.v2_active_bid_count,
        run.market_context.v1_active_bid_count,
        run.market_context.recent_v2_sales_count,
        run.market_context.recent_v1_sales_count,
        run.market_context.v1_v2_multiplier,
        Jsonb(run.market_context.context_json),
        run.trained_at,
      ),
    )
    with conn.cursor() as cursor:
      cursor.executemany(
        """
        INSERT INTO offchain.punk_predictions (
          run_id, standard, punk_id, quick_sale_wei, fair_value_wei,
          p10_sale_wei, p50_sale_wei, p90_sale_wei, sale_probability_24h,
          confidence, drivers_json, comps_json, trait_premiums_json,
          market_context_json
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
          (
            run.run_id,
            row["standard"],
            row["punk_id"],
            row["quick_sale_wei"],
            row["fair_value_wei"],
            row["p10_sale_wei"],
            row["p50_sale_wei"],
            row["p90_sale_wei"],
            row["sale_probability_24h"],
            row["confidence"],
            Jsonb(row["drivers_json"]),
            Jsonb(row["comps_json"]),
            Jsonb(row["trait_premiums_json"]),
            Jsonb(row["market_context_json"]),
          )
          for row in run.predictions
        ],
      )
      cursor.executemany(
        """
        INSERT INTO offchain.prediction_backtests (run_id, name, metrics_json)
        VALUES (%s, %s, %s)
        """,
        [(run.run_id, name, Jsonb(metrics)) for name, metrics in run.backtests.items()],
      )
    if decision["promote"]:
      conn.execute(
        """
        UPDATE offchain.prediction_model_runs
        SET active = false, status = 'superseded'
        WHERE active = true
        """
      )
      conn.execute(
        """
        UPDATE offchain.prediction_model_runs
        SET active = true, status = 'active'
        WHERE run_id = %s
        """,
        (run.run_id,),
      )
  return decision


def ordered_three(a: float, b: float, c: float) -> tuple[float, float, float]:
  low, mid, high = sorted([a, b, c])
  return low, mid, high


def sale_probability_heuristic(
  quick_eth: float,
  fair_eth: float,
  best_bid_eth: float | None,
) -> float:
  if fair_eth <= 0:
    return 0.0
  discount = max(0.0, 1.0 - quick_eth / fair_eth)
  probability = 0.18 + discount * 1.8
  if best_bid_eth and best_bid_eth >= quick_eth * 0.98:
    probability += 0.35
  return float(np.clip(probability, 0.05, 0.95))


def confidence_for(comps: list[dict[str, Any]], recent_sales_count: int) -> str:
  if recent_sales_count >= 20 and len(comps) >= 3:
    return "high"
  if recent_sales_count >= 5 or len(comps) >= 2:
    return "medium"
  return "low"


def median_ape(actual: np.ndarray, predicted: np.ndarray) -> float:
  mask = actual > 0
  if not mask.any():
    return 0.0
  return float(np.median(np.abs(predicted[mask] - actual[mask]) / actual[mask]))


def median_or_none(values: Iterable[float] | pd.Series | np.ndarray) -> float | None:
  array = np.asarray(list(values) if not isinstance(values, np.ndarray) else values, dtype=float)
  array = array[np.isfinite(array)]
  if len(array) == 0:
    return None
  return float(np.median(array))


def min_wei(df: pd.DataFrame, column: str) -> str | None:
  values = [parse_wei(value) for value in df[column].tolist()] if not df.empty else []
  values = [value for value in values if value is not None and value > 0]
  return str(min(values)) if values else None


def credible_relative_floor(
  floor_wei: str | None,
  reference_floor_wei: str | None,
  *,
  listed_count: int,
  min_count: int,
  max_ratio: float,
) -> str | None:
  if floor_wei is None or listed_count < min_count:
    return None
  floor_eth = wei_to_eth(floor_wei)
  reference_eth = wei_to_eth(reference_floor_wei)
  if floor_eth is not None and reference_eth is not None:
    if reference_eth <= 0 or floor_eth / reference_eth > max_ratio:
      return None
  return floor_wei


def max_wei(df: pd.DataFrame, column: str) -> str | None:
  values = [parse_wei(value) for value in df[column].tolist()] if not df.empty else []
  values = [value for value in values if value is not None and value > 0]
  return str(max(values)) if values else None


def max_wei_values(values: Iterable[str | None]) -> str | None:
  parsed = [parse_wei(value) for value in values]
  non_null = [value for value in parsed if value is not None and value > 0]
  return str(max(non_null)) if non_null else None


def parse_wei(value: Any) -> int | None:
  if value is None or (isinstance(value, float) and math.isnan(value)):
    return None
  return int(Decimal(str(value)))


def parse_id_json(value: Any) -> list[int]:
  if value is None:
    return []
  if isinstance(value, list):
    parsed = value
  else:
    try:
      parsed = json.loads(str(value))
    except Exception:
      return []
  if not isinstance(parsed, list):
    return []
  ids: list[int] = []
  for item in parsed:
    try:
      punk_id = int(item)
    except (TypeError, ValueError):
      continue
    if 0 <= punk_id < PUNK_COUNT:
      ids.append(punk_id)
  return ids


def wei_to_eth(value: str | None) -> float | None:
  if value is None:
    return None
  return float(Decimal(value) / WEI_PER_ETH)


def wei_to_float(value: str) -> float:
  return float(Decimal(value) / WEI_PER_ETH)


def wei_to_float_or_none(value: str | None) -> float | None:
  return wei_to_eth(value)


def eth_to_wei_string(value: float) -> str:
  if not math.isfinite(value):
    value = 0.000001
  with localcontext() as context:
    context.prec = 80
    decimal = Decimal(str(max(value, 0.000001))) * WEI_PER_ETH
    return str(int(decimal.to_integral_value(rounding=ROUND_HALF_UP)))


def ratio_or_none(a: float | None, b: float | None) -> float | None:
  if a is None or b is None or b == 0:
    return None
  return float(a / b)


def make_run_id(trained_at: datetime) -> str:
  stamp = trained_at.strftime("%Y%m%dT%H%M%SZ")
  digest = hashlib.sha1(stamp.encode("ascii")).hexdigest()[:8]
  return f"{stamp}-{digest}"


def utc_now() -> datetime:
  return datetime.now(tz=UTC).replace(microsecond=0)
