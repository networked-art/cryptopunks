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
import math
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


def fresh_probability_window(previous_report, cutoff):
  """Advance past all previously inspected final outcomes, without overlap."""
  if previous_report.get("phase") not in ("final", "monitor"):
    raise ValueError("Use the previous final or monitoring report")
  if "probability" in previous_report:
    previous_end = previous_report["probability"]["end"]
  else:
    previous_end = max(fold["end"] for fold in previous_report["folds"])
  start = datetime.fromisoformat(previous_end)
  if start.tzinfo is None:
    raise ValueError("Previous evaluation boundary must include its timezone")
  start_ts = int(start.timestamp())
  end_ts = cutoff - max(F.PROB_HORIZONS.values()) * F.SECONDS_PER_DAY
  return start_ts, max(start_ts, end_ts)


def price_summary(rows, runs):
  if not rows:
    return {"n": 0}
  a = np.array([int(r["actual_wei"]) / 1e18 for r in rows])
  p = np.array([int(r["fair_value_wei"]) / 1e18 for r in rows])
  lo = np.array([int(r["p10_sale_wei"]) / 1e18 for r in rows])
  hi = np.array([int(r["p90_sale_wei"]) / 1e18 for r in rows])
  covered = (lo <= a) & (a <= hi)
  n, rate, z = len(rows), float(covered.mean()), 1.96
  denominator = 1 + z*z/n
  center = (rate + z*z/(2*n)) / denominator
  radius = z * math.sqrt(rate*(1-rate)/n + z*z/(4*n*n)) / denominator
  tail = np.argsort(a)[int(0.9*n):]
  ages = [(r["ts"] - r["training_finished_at"].timestamp()) / 3600 for r in rows]
  out = {"n": n, "distinctPunks": len({int(r["punk_id"]) for r in rows}),
    "medianAPE": float(np.median(abs(p-a)/a)),
    "valueWeightedError": float(np.sum(abs(p-a))/np.sum(a)),
    "tailCount": len(tail), "tailMedianAPE": float(np.median(abs(p[tail]-a[tail])/a[tail])),
    "intervalCoverage": rate, "coverageWilson95": [center-radius, center+radius],
    "medianRelativeIntervalWidth": float(np.median((hi-lo)/a)),
    "meanRelativeIntervalScore80": float(np.mean((hi-lo + 10*np.maximum(lo-a, 0) + 10*np.maximum(a-hi, 0))/a)),
    "predictionAgeHours": {"min": min(ages), "median": float(np.median(ages)), "max": max(ages)}}
  cohorts = {"nearFloor": [], "premium": [], "unknownFloor": []}
  for r in rows:
    floor_key = "v2FloorEth" if r["source"] == "cryptopunks_v2" else "v1FloorEth"
    floor = runs[r["run_id"]]["metrics_json"].get("market", {}).get(floor_key)
    cohort = "unknownFloor" if not floor else "nearFloor" if int(r["fair_value_wei"])/1e18/float(floor) <= 1.25 else "premium"
    cohorts[cohort].append(r)
  out["forecastCohorts"] = {}
  for name, cohort in cohorts.items():
    if not cohort:
      continue
    actual = np.array([int(r["actual_wei"])/1e18 for r in cohort])
    pred = np.array([int(r["fair_value_wei"])/1e18 for r in cohort])
    out["forecastCohorts"][name] = {"n": len(cohort),
      "medianAPE": float(np.median(abs(pred-actual)/actual)),
      "valueWeightedError": float(np.sum(abs(pred-actual))/np.sum(actual))}
  return out


def monitor_cycle(args, payload, frame):
  with gzip.open(args.previous_snapshot, "rb") as stream:
    previous = pickle.load(stream)
  previous_report = json.loads(args.previous_report.read_text())
  start, end = fresh_probability_window(previous_report, payload["cutoff"])
  sales = normalize_sales(payload["dataset"]["events"])
  new_sales = sales[(sales["timestamp"] > previous["cutoff"]) & (sales["timestamp"] <= payload["cutoff"])]
  runs = {r["run_id"]: r for r in payload["runs"]}
  new_prices = {}
  for standard, sources in [("v2", {"cryptopunks_v2"}), ("v1", {"cryptopunks_v1", "punks_market"})]:
    matched = [r for r in payload["realized"] if r["source"] in sources and r["ts"] > previous["cutoff"]]
    count = int((new_sales["standard"] == standard).sum())
    new_prices[standard] = {"indexedSales": count, "unscoredSales": count-len(matched),
      "servedPredictions": price_summary(matched, runs)}
  probability = {"start": datetime.fromtimestamp(start, UTC).isoformat(),
    "end": datetime.fromtimestamp(end, UTC).isoformat(),
    "origin": datetime.fromtimestamp(start, UTC).isoformat(),
    "newWindowDays": (end-start)/F.SECONDS_PER_DAY,
    "candidateExperiments": [],
    "scope": "Chronological replay at observed listing asks; not live calibration of hypothetical quick-sale asks."}
  hold = frame[(frame["ts"] >= start) & (frame["ts"] < end)]
  if end > start and not hold.empty:
    hold, p, counts = fit_predict(frame, start, end, "incumbent")
    rates = []
    for label, days in F.PROB_HORIZONS.items():
      mature = frame[frame["ts"] + days * F.SECONDS_PER_DAY < start]
      rates.append(float(mature[label].mean()))
    probability.update({"incumbent": metrics(hold, p), "trainRowsByHorizon": counts,
      "distinctPunks": int(hold["punk_id"].nunique()),
      "observationDays": int((hold["ts"] // F.SECONDS_PER_DAY).nunique()),
      "baseRate": metrics(hold, np.tile(rates, (len(hold), 1)))})
  else:
    probability["n"] = 0
  preflight = json.loads(args.preflight.read_text()) if args.preflight else None
  return {"phase": "monitor", "referenceRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "evaluatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "featureSha256": hashlib.sha256(Path(F.__file__).read_bytes()).hexdigest(),
    "preflightSha256": hashlib.sha256(args.preflight.read_bytes()).hexdigest() if args.preflight else None,
    "snapshotSha256": hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
    "previousSnapshotSha256": hashlib.sha256(args.previous_snapshot.read_bytes()).hexdigest(),
    "previousReportSha256": hashlib.sha256(args.previous_report.read_bytes()).hexdigest(),
    "cutoff": datetime.fromtimestamp(payload["cutoff"], UTC).isoformat(),
    "previousCycleCutoff": datetime.fromtimestamp(previous["cutoff"], UTC).isoformat(),
    "production": preflight, "newPriceOutcomes": new_prices,
    "rollingPriceOutcomes": realized_summary(payload), "probability": probability,
    "v1SalesSinceFix": sum(r["source"] != "cryptopunks_v2" and runs[r["run_id"]]["metrics_json"].get("market", {}).get("v1V2MultiplierInputs", {}).get("saleCohort") == "human" for r in payload["realized"]),
    "candidateExperiments": [],
    "limitations": ["Publication is approximated by training completion, excluding the first minute; exact activation time is unavailable.",
      "The newest final period starts after the previous inspected boundary; rolling the old 60-day fold forward would reuse known outcomes.",
      "Small samples and repeated listings limit inference. Probability replay includes both sales and non-sales with fully elapsed 30-day horizons.",
      "Existing V1 rolling errors are historical and cannot demonstrate post-fix performance without new V1 sales."],
    "decision": {"modelSelectionPerformed": False, "productionDeployment": False,
      "reason": "Monitoring only. Register a separate candidate experiment before model selection."}}


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("snapshot", type=Path)
  parser.add_argument("--phase", choices=["development", "final", "monitor"], required=True)
  parser.add_argument("--candidate", choices=["mature", "recent", "coherent"])
  parser.add_argument("--output", type=Path, required=True)
  parser.add_argument("--previous-snapshot", type=Path)
  parser.add_argument("--previous-report", type=Path)
  parser.add_argument("--preflight", type=Path)
  args = parser.parse_args()
  if args.phase == "final" and not args.candidate:
    parser.error("Final evaluation requires a candidate selected on development folds")
  if args.phase == "monitor" and not (args.previous_snapshot and args.previous_report):
    parser.error("Monitoring requires the previous snapshot and final/monitor report")
  if args.phase == "monitor" and args.candidate:
    parser.error("Monitoring does not evaluate candidate models")
  with gzip.open(args.snapshot, "rb") as stream:
    payload = pickle.load(stream)
  frame = load_frame(args.snapshot, payload)
  if args.phase == "monitor":
    report = monitor_cycle(args, payload, frame)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)
    return
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
