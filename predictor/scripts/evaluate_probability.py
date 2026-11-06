"""Compare probability candidates on a trusted snapshot, without database writes.

Development uses three past 60-day folds. Final evaluation requires one selected
candidate and uses the subsequent 60 days, ending 30 days before the snapshot.
Never load snapshots or feature caches from an untrusted source.
"""

import argparse
from datetime import UTC, datetime
import gzip
import hashlib
import json
from pathlib import Path
import pickle
import subprocess

import numpy as np
import pandas as pd

from punks_predictor import features as F
from punks_predictor.pipeline import (
  _prob_model, build_static_features, normalize_sales,
  v2_listing_events, v2_bid_events,
)


def project_curve(p):
  """Euclidean projection onto 24h <= 7d <= 30d (three-point PAVA)."""
  out = p.copy()
  a, b, c = p.T
  ab = a > b
  mean_ab = (a + b) / 2
  out[ab, :2] = mean_ab[ab, None]
  all_ab = ab & (mean_ab > c)
  bc = (~ab) & (b > c)
  mean_bc = (b + c) / 2
  out[bc, 1:] = mean_bc[bc, None]
  all_bc = bc & (a > mean_bc)
  pooled = all_ab | all_bc
  out[pooled] = np.mean(p[pooled], axis=1)[:, None]
  return out


def load_frame(snapshot, payload):
  fingerprint = hashlib.sha256(snapshot.read_bytes() + Path(F.__file__).read_bytes()).hexdigest()[:16]
  cache = snapshot.with_suffix(f".{fingerprint}.listing-frame.pkl")
  if cache.exists():
    return pd.read_pickle(cache)
  data = payload["dataset"]
  static = build_static_features(data["traits"], data["colors"], data["visuals"])
  sales = normalize_sales(data["events"])
  sales = sales[sales["standard"] == "v2"]
  frame = F.build_listing_training_frame(
    sales=sales[["punk_id", "timestamp", "eth"]],
    listings=v2_listing_events(data["events"]), moves=data["moves"],
    bid_events=v2_bid_events(data["native_bids"]),
    traits_by_punk=static["traits_by_punk"],
    supply=F.trait_supply(static["traits_by_punk"]),
  ).sort_values("ts").reset_index(drop=True)
  frame = frame[np.isfinite(frame["ask_ratio"])].copy()
  frame.to_pickle(cache)
  return frame


def fit_predict(frame, origin, end, kind):
  hold = frame[(frame["ts"] >= origin) & (frame["ts"] < end)]
  x_hold = F.prob_design(hold)
  predictions = []
  counts = []
  for label, days in F.PROB_HORIZONS.items():
    latest = origin if kind == "incumbent" else origin - days * F.SECONDS_PER_DAY
    fit = frame[frame["ts"] < latest]
    # Reproduce what the incumbent could actually observe at this origin.
    y_fit = fit[label].to_numpy(dtype=float)
    if kind == "incumbent":
      y_fit = y_fit * (fit["next_sale_ts"].to_numpy(dtype=float) <= origin)
    weight = None
    if kind == "recent":
      weight = np.power(0.5, (origin - fit["ts"].to_numpy()) / (365 * F.SECONDS_PER_DAY))
    model = _prob_model().fit(F.prob_design(fit), y_fit, sample_weight=weight)
    predictions.append(np.clip(model.predict(x_hold), 0.02, 0.98))
    counts.append(len(fit))
  p = np.column_stack(predictions)
  if kind == "coherent":
    p = project_curve(p)
  return hold, p, counts


def calibration(y, p):
  bins = np.minimum((p * 10).astype(int), 9)
  return float(sum(
    np.sum(bins == b) * abs(np.mean(p[bins == b]) - np.mean(y[bins == b]))
    for b in range(10) if np.any(bins == b)
  ) / len(y))


def metrics(hold, p):
  y = hold[list(F.PROB_HORIZONS)].to_numpy(dtype=float)
  out = {"n": len(hold), "meanBrier": float(np.mean((p - y) ** 2)),
         "incoherentRows": int(np.sum(np.any(np.diff(p, axis=1) < -1e-12, axis=1)))}
  for j, label in enumerate(F.PROB_HORIZONS):
    out[label] = {"brier": float(np.mean((p[:, j] - y[:, j]) ** 2)),
      "positiveCount": int(y[:, j].sum()), "meanPredicted": float(p[:, j].mean()),
      "observedRate": float(y[:, j].mean()), "ece10": calibration(y[:, j], p[:, j])}
  out["askCohorts"] = {}
  for name, mask in [("nearFloor", hold["ask_ratio"].to_numpy() <= 1.25),
                     ("premium", hold["ask_ratio"].to_numpy() > 1.25)]:
    if np.any(mask):
      out["askCohorts"][name] = {"n": int(mask.sum()),
        "meanBrier": float(np.mean((p[mask] - y[mask]) ** 2)),
        "positiveCounts": y[mask].sum(axis=0).astype(int).tolist()}
  return out


def paired_interval(hold, baseline, candidate):
  y = hold[list(F.PROB_HORIZONS)].to_numpy(dtype=float)
  delta = np.mean((candidate - y) ** 2 - (baseline - y) ** 2, axis=1)
  groups = pd.DataFrame({"day": hold["ts"].to_numpy() // F.SECONDS_PER_DAY, "delta": delta})
  days = groups.groupby("day")["delta"].agg(["sum", "count"]).to_numpy()
  rng = np.random.default_rng(1001)
  samples = days[rng.integers(0, len(days), size=(2000, len(days)))].sum(axis=1)
  boot = samples[:, 0] / samples[:, 1]
  return {"candidateMinusIncumbent": float(np.mean(delta)),
          "dailyBlockBootstrap95": np.quantile(boot, [0.025, 0.975]).tolist()}


def realized_summary(payload):
  rows = payload["realized"]
  results = {}
  for standard, sources in [("v2", {"cryptopunks_v2"}), ("v1", {"cryptopunks_v1", "punks_market"})]:
    for window in [5, 14, 90]:
      selected = [r for r in rows if r["source"] in sources and r["ts"] >= payload["cutoff"] - window * F.SECONDS_PER_DAY]
      if not selected:
        results[f"{standard}_{window}d"] = {"n": 0}
        continue
      a = np.array([int(r["actual_wei"]) / 1e18 for r in selected])
      p = np.array([int(r["fair_value_wei"]) / 1e18 for r in selected])
      lo = np.array([int(r["p10_sale_wei"]) / 1e18 for r in selected])
      hi = np.array([int(r["p90_sale_wei"]) / 1e18 for r in selected])
      results[f"{standard}_{window}d"] = {"n": len(a), "medianAPE": float(np.median(abs(p-a)/a)),
        "valueWeightedError": float(np.sum(abs(p-a))/np.sum(a)),
        "intervalCoverage": float(np.mean((lo <= a) & (a <= hi))),
        "medianRelativeIntervalWidth": float(np.median((hi-lo)/a))}
  return results


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("snapshot", type=Path)
  parser.add_argument("--phase", choices=["development", "final"], required=True)
  parser.add_argument("--candidate", choices=["mature", "recent", "coherent"])
  parser.add_argument("--output", type=Path, required=True)
  args = parser.parse_args()
  if args.phase == "final" and not args.candidate:
    parser.error("Final evaluation requires a candidate selected on development folds")
  with gzip.open(args.snapshot, "rb") as stream:
    payload = pickle.load(stream)
  frame = load_frame(args.snapshot, payload)
  cutoff = payload["cutoff"]
  origins = [270, 210, 150] if args.phase == "development" else [90]
  candidates = ["mature", "recent", "coherent"] if args.phase == "development" else [args.candidate]
  report = {"phase": args.phase, "snapshotSha256": hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
    "referenceRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "evaluatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "featureSha256": hashlib.sha256(Path(F.__file__).read_bytes()).hexdigest(),
    "modelParameters": _prob_model().get_params(),
    "cutoff": datetime.fromtimestamp(cutoff, UTC).isoformat(), "listingRows": len(frame),
    "realized": realized_summary(payload), "folds": [],
    "limitations": ["Historical publication time is approximated by training_finished_at plus a 60-second guard; activation time was not recorded.",
      "Probability results concern historical listing asks, not counterfactual quick-sale asks or V1's heuristic.",
      "Repeated listings and market regimes create dependence; uncertainty uses daily blocks."]}
  for ago in origins:
    origin = cutoff - ago * F.SECONDS_PER_DAY
    end = origin + 60 * F.SECONDS_PER_DAY
    hold, baseline, counts = fit_predict(frame, origin, end, "incumbent")
    fit = frame[frame["ts"] < origin]
    rates = []
    for label, days in F.PROB_HORIZONS.items():
      mature = fit[fit["ts"] + days * F.SECONDS_PER_DAY <= origin]
      rates.append(mature[label].mean())
    fold = {"start": datetime.fromtimestamp(origin, UTC).isoformat(),
      "end": datetime.fromtimestamp(end, UTC).isoformat(), "incumbent": metrics(hold, baseline),
      "baseRate": metrics(hold, np.tile(rates, (len(hold), 1))), "candidates": {}}
    for candidate in candidates:
      _, p, counts = fit_predict(frame, origin, end, candidate)
      fold["candidates"][candidate] = {**metrics(hold, p), "trainRowsByHorizon": counts,
        "comparison": paired_interval(hold, baseline, p)}
    report["folds"].append(fold)
    print(json.dumps(fold), flush=True)
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
  main()
