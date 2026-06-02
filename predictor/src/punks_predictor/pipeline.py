from __future__ import annotations

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
from sklearn.ensemble import GradientBoostingRegressor

from . import __version__
from .db import DatabaseConfig, connect


PUNK_COUNT = 10_000
TRAIT_COUNT = 111
WEI_PER_ETH = Decimal("1000000000000000000")
SECONDS_PER_DAY = 86_400
MODEL_VERSION = f"punks-24h-v{__version__}"
RANDOM_STATE = 1001
PUNKS_MARKET_ADDRESS = "0x64e507febf26521b73fbdfa533106b2042533218"
# A refreshed run may carry a little more error than the incumbent (different
# out-of-time test set) and still be worth promoting for the newer market data.
PROMOTION_REGRESSION_TOLERANCE = 0.05

V2_SALE_SOURCES = {"cryptopunks_v2"}
V1_SALE_SOURCES = {"cryptopunks_v1", "punks_market"}


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

  trait_premiums = compute_trait_premiums(v2_sales, static["trait_matrix"])
  comps_index = build_comps_index(v2_sales, static["traits_by_punk"])
  v2_model = train_price_model(v2_sales, static)
  v2_predictions = predict_v2(
    model=v2_model,
    static=static,
    market=market,
    trait_premiums=trait_premiums,
    comps_index=comps_index,
    current_bids=dataset["v2_bids"],
  )
  v1_predictions = predict_v1(
    v2_predictions=v2_predictions,
    market=market,
    current_bids=dataset["v1_bids"],
    market_bids=dataset["market_bids"],
    static=static,
  )

  predictions = v2_predictions + v1_predictions
  training_finished_at = utc_now()
  metrics = {
    "target": "24h_sale",
    "sale_count_v2": int(len(v2_sales)),
    "sale_count_v1": int(len(v1_sales)),
    "model": v2_model["metrics"],
    "market": market.context_json,
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
) -> dict[int, dict[str, float | int]]:
  if v2_sales.empty:
    return {}
  global_median = float(np.median(np.log(v2_sales["eth"].to_numpy(dtype=float))))
  premiums: dict[int, dict[str, float | int]] = {}
  sale_punks = v2_sales["punk_id"].to_numpy(dtype=int)
  sale_logs = np.log(v2_sales["eth"].to_numpy(dtype=float))
  for trait_id in range(TRAIT_COUNT):
    has_trait = trait_matrix[sale_punks, trait_id] > 0
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


def train_price_model(
  v2_sales: pd.DataFrame,
  static: dict[str, Any],
) -> dict[str, Any]:
  fallback_eth = (
    float(np.median(v2_sales["eth"].to_numpy(dtype=float)))
    if not v2_sales.empty
    else 1.0
  )
  if len(v2_sales) < 30:
    predictions = np.full(PUNK_COUNT, fallback_eth, dtype=float)
    return {
      "kind": "baseline",
      "p10_model": predictions * 0.85,
      "p50_model": predictions,
      "p90_model": predictions * 1.25,
      "metrics": {"kind": "baseline", "testCount": 0},
      "baseline_metrics": {"medianEth": fallback_eth},
    }

  sales = v2_sales.sort_values("timestamp").reset_index(drop=True)
  split = max(1, int(len(sales) * 0.8))
  train = sales.iloc[:split]
  test = sales.iloc[split:]
  x_train = static["features"][train["punk_id"].to_numpy(dtype=int)]
  y_train = np.log(train["eth"].to_numpy(dtype=float))
  weights = recency_weights(train["timestamp"].to_numpy(dtype=int))

  model = GradientBoostingRegressor(
    n_estimators=240,
    max_depth=3,
    learning_rate=0.045,
    subsample=0.85,
    random_state=RANDOM_STATE,
  )
  q10 = GradientBoostingRegressor(
    loss="quantile",
    alpha=0.10,
    n_estimators=220,
    max_depth=3,
    learning_rate=0.045,
    subsample=0.85,
    random_state=RANDOM_STATE,
  )
  q90 = GradientBoostingRegressor(
    loss="quantile",
    alpha=0.90,
    n_estimators=220,
    max_depth=3,
    learning_rate=0.045,
    subsample=0.85,
    random_state=RANDOM_STATE,
  )
  model.fit(x_train, y_train, sample_weight=weights)
  q10.fit(x_train, y_train, sample_weight=weights)
  q90.fit(x_train, y_train, sample_weight=weights)

  metrics = evaluate_price_model(model, train, test, static, fallback_eth)
  x_all = static["features"]
  p50 = np.exp(model.predict(x_all))
  p10 = np.exp(q10.predict(x_all))
  p90 = np.exp(q90.predict(x_all))
  p10, p50, p90 = ordered_quantiles(p10, p50, p90)
  return {
    "kind": "gradient_boosting",
    "p10_model": p10,
    "p50_model": p50,
    "p90_model": p90,
    "metrics": metrics,
    "baseline_metrics": metrics.get("baseline", {}),
  }


def evaluate_price_model(
  model: GradientBoostingRegressor,
  train: pd.DataFrame,
  test: pd.DataFrame,
  static: dict[str, Any],
  fallback_eth: float,
) -> dict[str, Any]:
  if test.empty:
    return {"kind": "gradient_boosting", "testCount": 0}
  x_test = static["features"][test["punk_id"].to_numpy(dtype=int)]
  actual = test["eth"].to_numpy(dtype=float)
  predicted = np.exp(model.predict(x_test))
  baseline = np.full_like(actual, float(np.median(train["eth"])))
  return {
    "kind": "gradient_boosting",
    "testCount": int(len(test)),
    "medianAbsolutePercentError": median_ape(actual, predicted),
    "medianAbsoluteLogError": float(np.median(np.abs(np.log(predicted / actual)))),
    "baseline": {
      "medianEth": fallback_eth,
      "medianAbsolutePercentError": median_ape(actual, baseline),
    },
  }


def predict_v2(
  *,
  model: dict[str, Any],
  static: dict[str, Any],
  market: MarketContext,
  trait_premiums: dict[int, dict[str, float | int]],
  comps_index: dict[int, list[dict[str, Any]]],
  current_bids: pd.DataFrame,
) -> list[dict[str, Any]]:
  p10 = model["p10_model"].astype(float).copy()
  p50 = model["p50_model"].astype(float).copy()
  p90 = model["p90_model"].astype(float).copy()
  scale = market_scale(p50, market)
  p10 *= scale
  p50 *= scale
  p90 *= scale
  best_bids = bids_by_punk(current_bids)
  floor_eth = wei_to_eth(market.v2_floor_wei)
  market_context = {
    "standard": "v2",
    "marketScale": scale,
    "floorWei": market.v2_floor_wei,
    "bidFloorWei": market.v2_bid_floor_wei,
  }

  out: list[dict[str, Any]] = []
  for punk_id in range(PUNK_COUNT):
    comps = comps_index.get(punk_id, [])
    comp_eth = median_or_none([comp["eth"] for comp in comps])
    fair = float(p50[punk_id])
    if comp_eth:
      fair = 0.72 * fair + 0.28 * comp_eth
    if floor_eth:
      fair = max(fair, floor_eth * 0.85)
    low = min(float(p10[punk_id]), fair * 0.92)
    high = max(float(p90[punk_id]), fair * 1.12)
    best_bid_eth = wei_to_eth(best_bids.get(punk_id))
    quick = min(fair, max(best_bid_eth or 0.0, low * 0.98))
    probability = sale_probability_heuristic(quick, fair, best_bid_eth)
    confidence = confidence_for(comps, market.recent_v2_sales_count)
    trait_drivers = top_trait_premiums(static["traits_by_punk"][punk_id], trait_premiums)
    drivers = prediction_drivers(
      floor_eth=floor_eth,
      best_bid_eth=best_bid_eth,
      fair_eth=fair,
      trait_drivers=trait_drivers,
      comps=comps,
      market_scale=scale,
    )
    out.append(
      prediction_row(
        standard="v2",
        punk_id=punk_id,
        quick_eth=quick,
        fair_eth=fair,
        p10_eth=low,
        p50_eth=fair,
        p90_eth=high,
        probability=probability,
        confidence=confidence,
        drivers=drivers,
        comps=comps[:5],
        trait_premiums=trait_drivers,
        market_context=market_context,
      )
    )
  return out


def predict_v1(
  *,
  v2_predictions: list[dict[str, Any]],
  market: MarketContext,
  current_bids: pd.DataFrame,
  market_bids: pd.DataFrame,
  static: dict[str, Any],
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
    best_bid_eth = wei_to_eth(best_bids.get(punk_id))
    quick = min(fair, max(best_bid_eth or 0.0, low * 0.98))
    probability = sale_probability_heuristic(quick, fair, best_bid_eth)
    confidence = "medium" if market.recent_v1_sales_count >= 5 else "low"
    drivers = [
      {
        "kind": "v1_v2_multiplier",
        "label": "V1/V2 market adjustment",
        "value": multiplier,
      },
      *base["drivers_json"][:4],
    ]
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
  recent_cutoff = int(datetime.now(tz=UTC).timestamp()) - 365 * SECONDS_PER_DAY
  recent = v2_sales[v2_sales["timestamp"] >= recent_cutoff].copy()
  if recent.empty:
    recent = v2_sales.sort_values("timestamp").tail(500).copy()

  trait_supply: dict[int, int] = {}
  for traits in traits_by_punk:
    for trait_id in traits:
      trait_supply[trait_id] = trait_supply.get(trait_id, 0) + 1

  sales_by_trait: dict[int, list[dict[str, Any]]] = {}
  for row in recent.sort_values("timestamp", ascending=False).itertuples(index=False):
    sale_traits = traits_by_punk[int(row.punk_id)]
    sale = {
      "punkId": int(row.punk_id),
      "eth": float(row.eth),
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
  rows = []
  for trait_id in traits:
    premium = premiums.get(trait_id)
    if not premium:
      continue
    rows.append(
      {
        "traitId": trait_id,
        "saleCount": int(premium["saleCount"]),
        "multiplier": float(premium["multiplier"]),
        "logPremium": float(premium["logPremium"]),
      }
    )
  return sorted(rows, key=lambda row: abs(float(row["logPremium"])), reverse=True)[:6]


def prediction_drivers(
  *,
  floor_eth: float | None,
  best_bid_eth: float | None,
  fair_eth: float,
  trait_drivers: list[dict[str, Any]],
  comps: list[dict[str, Any]],
  market_scale: float,
) -> list[dict[str, Any]]:
  drivers: list[dict[str, Any]] = [
    {
      "kind": "market_scale",
      "label": "Current market scale",
      "value": market_scale,
    }
  ]
  if floor_eth:
    drivers.append(
      {
        "kind": "floor",
        "label": "Current V2 floor",
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
      }
    )
  for trait in trait_drivers[:3]:
    drivers.append(
      {
        "kind": "trait",
        "label": f"Trait {trait['traitId']} premium",
        **trait,
      }
    )
  return drivers


def market_scale(p50_model: np.ndarray, market: MarketContext) -> float:
  floor_eth = wei_to_eth(market.v2_floor_wei)
  if not floor_eth:
    return 1.0
  model_floor = float(np.percentile(p50_model, 5))
  if model_floor <= 0:
    return 1.0
  return float(np.clip(floor_eth / model_floor, 0.25, 4.0))


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


def active_model_ape(conn: Connection) -> tuple[bool, float | None]:
  row = conn.execute(
    """
    SELECT metrics_json
    FROM offchain.prediction_model_runs
    WHERE active = true
    LIMIT 1
    """
  ).fetchone()
  if row is None:
    return False, None
  metrics = row["metrics_json"] if isinstance(row, dict) else row[0]
  model = metrics.get("model", {}) if isinstance(metrics, dict) else {}
  ape = model.get("medianAbsolutePercentError")
  return True, float(ape) if isinstance(ape, (int, float)) else None


def decide_promotion(conn: Connection, run: PredictionRun) -> dict[str, Any]:
  model_metrics = run.metrics.get("model", {})
  baseline_metrics = model_metrics.get("baseline", {})
  has_incumbent, incumbent_ape = active_model_ape(conn)
  return promotion_decision(
    model_ape=model_metrics.get("medianAbsolutePercentError"),
    baseline_ape=baseline_metrics.get("medianAbsolutePercentError"),
    incumbent_ape=incumbent_ape,
    has_incumbent=has_incumbent,
  )


def promotion_decision(
  *,
  model_ape: float | None,
  baseline_ape: float | None,
  incumbent_ape: float | None,
  has_incumbent: bool,
) -> dict[str, Any]:
  decision: dict[str, Any] = {
    "modelMedianApe": model_ape,
    "baselineMedianApe": baseline_ape,
    "incumbentMedianApe": incumbent_ape,
    "regressionTolerance": PROMOTION_REGRESSION_TOLERANCE,
  }
  if not has_incumbent:
    return {**decision, "promote": True, "reason": "bootstrap: no active model"}
  if model_ape is None:
    return {**decision, "promote": False, "reason": "no holdout evaluation (testCount=0)"}
  if baseline_ape is not None and model_ape > baseline_ape:
    return {**decision, "promote": False, "reason": "does not beat the median baseline"}
  if (
    incumbent_ape is not None
    and model_ape > incumbent_ape * (1.0 + PROMOTION_REGRESSION_TOLERANCE)
  ):
    return {**decision, "promote": False, "reason": "regresses versus the active model"}
  return {
    **decision,
    "promote": True,
    "reason": "beats baseline and holds versus the active model",
  }


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


def recency_weights(timestamps: np.ndarray) -> np.ndarray:
  now = max(int(timestamps.max()), int(datetime.now(tz=UTC).timestamp()))
  age_days = np.maximum(0.0, (now - timestamps.astype(float)) / SECONDS_PER_DAY)
  return np.exp(-age_days / 180.0) + 0.05


def ordered_quantiles(
  p10: np.ndarray,
  p50: np.ndarray,
  p90: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
  low = np.minimum.reduce([p10, p50, p90])
  high = np.maximum.reduce([p10, p50, p90])
  mid = p10 + p50 + p90 - low - high
  return low, mid, high


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
