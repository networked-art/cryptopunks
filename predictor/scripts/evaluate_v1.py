"""Replay V1 forecasts from archived, pre-sale production inputs.

Only load snapshots from a trusted source. The reference module comes from an
explicit Git revision; no historical feature reconstruction or model fitting is
needed for a change confined to V1 post-processing.
"""

import argparse
from collections import Counter
from dataclasses import fields
from datetime import UTC, datetime
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import pickle
import subprocess
import sys

import numpy as np
import pandas as pd

from punks_predictor import pipeline


def reference_module(revision, directory):
  revision = subprocess.check_output(["git", "rev-parse", "--verify", f"{revision}^{{commit}}"], text=True).strip()
  source = subprocess.check_output(["git", "show", f"{revision}:predictor/src/punks_predictor/pipeline.py"])
  path = directory / f"v1-reference-{revision}.py"
  path.write_bytes(source)
  name = "punks_predictor._v1_reference"
  spec = importlib.util.spec_from_file_location(name, path)
  module = importlib.util.module_from_spec(spec)
  sys.modules[name] = module
  spec.loader.exec_module(module)
  return revision, module


def predict(module, base, market_row, v1_rows, multiplier=None):
  context = {f.name: market_row[f.name] for f in fields(module.MarketContext)}
  # The SQL market column rounds to six decimal places. Forecast drivers retain
  # the exact multiplier used in memory, which is required for an exact replay.
  multipliers = {
    float(d["value"]) for row in v1_rows for d in row["drivers_json"]
    if d.get("kind") == "v1_v2_multiplier"
  }
  if len(multipliers) != 1:
    raise ValueError("Expected one exact archived multiplier per model run")
  context["v1_v2_multiplier"] = multipliers.pop() if multiplier is None else multiplier
  reservations = {}
  for row in v1_rows:
    for driver in row["drivers_json"]:
      if driver.get("kind") == "reservation_signal":
        reservations[int(row["punk_id"])] = driver
  return module.predict_v1(
    v2_predictions=base, market=module.MarketContext(**context),
    current_bids=pd.DataFrame(columns=["punk_id", "value_wei"]),
    market_bids=pd.DataFrame(), static={}, reservations=reservations,
  )


def metrics(rows):
  if not rows:
    return {"n": 0}
  a = np.array([r["actualEth"] for r in rows])
  out = {"n": len(rows), "distinctPunks": len({r["punkId"] for r in rows})}
  for label in ["incumbent", "candidate"]:
    p = np.array([r[f"{label}Eth"] for r in rows])
    lo = np.array([r[f"{label}P10Eth"] for r in rows])
    hi = np.array([r[f"{label}P90Eth"] for r in rows])
    out[label] = {"medianAPE": float(np.median(abs(p-a)/a)),
      "valueWeightedError": float(np.sum(abs(p-a))/np.sum(a)),
      "intervalCoverage": float(np.mean((lo <= a) & (a <= hi)))}
  return out


def cohort_multiplier(sales, traits, market, cutoff, exact, reference):
  recent = sales[(sales["timestamp"] >= cutoff - 30 * 86400) & (sales["timestamp"] < cutoff)]
  v1 = recent[recent["standard"] == "v1"]
  v2 = recent[recent["standard"] == "v2"]
  if len(v1) != market["recent_v1_sales_count"] or len(v2) != market["recent_v2_sales_count"]:
    raise ValueError("Historical sale window does not match archived market counts")
  kwargs = dict(
    v1_floor_eth=pipeline.wei_to_eth(market["v1_floor_wei"]),
    v2_floor_eth=pipeline.wei_to_eth(market["v2_floor_wei"]),
    v1_bid_eth=pipeline.wei_to_eth(market["v1_bid_floor_wei"]),
    v2_bid_eth=pipeline.wei_to_eth(market["v2_bid_floor_wei"]),
    v1_listed_count=market["v1_listed_count"],
  )
  unfiltered = reference.v1_v2_multiplier(
    **kwargs, recent_v1_eth=v1["eth"].to_numpy(dtype=float),
    recent_v2_eth=v2["eth"].to_numpy(dtype=float),
  )
  if not np.isclose(unfiltered, exact, rtol=0, atol=1e-14):
    raise ValueError("Historical multiplier inputs do not reproduce the incumbent")
  return pipeline.v1_v2_multiplier(
    **kwargs, recent_v1_eth=pipeline.human_sale_prices(v1, traits),
    recent_v2_eth=pipeline.human_sale_prices(v2, traits),
  )


def full_run(payload, reference):
  cutoff = datetime.fromtimestamp(payload["cutoff"], UTC)

  class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
      return cutoff.astimezone(tz) if tz is not None else cutoff.replace(tzinfo=None)

  original_dates = reference.datetime, pipeline.datetime
  reference.datetime = pipeline.datetime = FixedDatetime
  try:
    runs = []
    for label, module in [("incumbent", reference), ("candidate", pipeline)]:
      print(f"Building complete {label} run without database writes", flush=True)
      run = module.build_prediction_run(
        dataset=payload["dataset"], views_schema="punks", training_started_at=cutoff,
      )
      runs.append(run)
  finally:
    reference.datetime, pipeline.datetime = original_dates
  incumbent, candidate = runs
  base_v2 = [r for r in incumbent.predictions if r["standard"] == "v2"]
  next_v2 = [r for r in candidate.predictions if r["standard"] == "v2"]
  if base_v2 != next_v2:
    raise ValueError("Candidate changed V2 predictions")
  invalid = []
  for row in candidate.predictions:
    lo, mid, hi = [int(row[k]) for k in ["p10_sale_wei", "p50_sale_wei", "p90_sale_wei"]]
    if not (0 < lo <= mid <= hi and int(row["fair_value_wei"]) > 0
            and 0 < int(row["quick_sale_wei"]) <= hi
            and np.isfinite(row["sale_probability_24h"])
            and 0 <= row["sale_probability_24h"] <= 1):
      invalid.append((row["standard"], row["punk_id"]))
  identities = {(r["standard"], r["punk_id"]) for r in candidate.predictions}
  if invalid or len(identities) != 20_000 or len(candidate.predictions) != 20_000:
    raise ValueError("Invalid or incomplete full prediction run")
  return {"predictionCount": len(candidate.predictions), "v2Identical": True,
    "invalidRows": invalid, "v2PredictionSha256": hashlib.sha256(
      json.dumps(next_v2, sort_keys=True, default=str).encode()).hexdigest(),
    "candidateMarket": candidate.metrics["market"],
    "incumbentPriceMetrics": incumbent.metrics["model"],
    "candidatePriceMetrics": candidate.metrics["model"],
    "candidateProbabilityMetrics": candidate.metrics["saleProbability"]}


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("snapshot", type=Path)
  parser.add_argument("--reference-revision", required=True)
  parser.add_argument("--output", type=Path, required=True)
  candidates = parser.add_mutually_exclusive_group()
  candidates.add_argument("--human-cohort", action="store_true")
  candidates.add_argument("--remove-asking-floor", action="store_true")
  parser.add_argument("--full-run", action="store_true", help="Build both complete runs locally and verify V2 equality")
  args = parser.parse_args()
  if args.full_run and args.remove_asking_floor:
    parser.error("Full-run validation applies to the current implementation, not the rejected floor deletion")
  with gzip.open(args.snapshot, "rb") as stream:
    payload = pickle.load(stream)
  revision, reference = reference_module(args.reference_revision, args.snapshot.parent)
  sales = pipeline.normalize_sales(payload["dataset"]["events"])
  runs = {r["run_id"]: r for r in payload["runs"]}
  rows = []
  mismatches = []
  for record in payload["v1_replay"]:
    archived = record["v1_prediction"]
    inputs = ([record["v2_prediction"]], record["market"], [archived])
    incumbent = predict(reference, *inputs)[0]
    multiplier = None
    candidate_inputs = list(inputs)
    if args.remove_asking_floor:
      candidate_inputs[1] = {**record["market"], "v1_floor_wei": None}
    if args.human_cohort:
      cutoff = int(runs[record["run_id"]]["data_cutoff"].timestamp())
      exact = next(d["value"] for d in archived["drivers_json"] if d.get("kind") == "v1_v2_multiplier")
      multiplier = cohort_multiplier(
        sales, payload["dataset"]["traits"], record["market"], cutoff, exact, reference,
      )
    candidate = predict(pipeline, *candidate_inputs, multiplier=multiplier)[0]
    for key in ["fair_value_wei", "p10_sale_wei", "p50_sale_wei", "p90_sale_wei"]:
      if int(incumbent[key]) != int(archived[key]):
        mismatches.append({"runId": record["run_id"], "punkId": int(record["punk_id"]), "field": key})
    row = {"timestamp": record["ts"], "date": datetime.fromtimestamp(record["ts"], UTC).isoformat(),
      "punkId": int(record["punk_id"]), "source": record["source"], "txHash": record["tx_hash"],
      "runId": record["run_id"], "actualEth": int(record["actual_wei"]) / 1e18,
      "v1FloorEth": pipeline.wei_to_eth(record["market"]["v1_floor_wei"]),
      "multiplier": next(d["value"] for d in archived["drivers_json"] if d.get("kind") == "v1_v2_multiplier"),
      "candidateMultiplier": multiplier}
    for label, forecast in [("incumbent", incumbent), ("candidate", candidate)]:
      for suffix, key in [("Eth", "fair_value_wei"), ("P10Eth", "p10_sale_wei"), ("P90Eth", "p90_sale_wei")]:
        row[label + suffix] = int(forecast[key]) / 1e18
    rows.append(row)
  times = sorted({r["timestamp"] for r in rows})
  split = times[len(times) // 2]
  price_regressions = [r for r in rows if abs(r["candidateEth"] - r["actualEth"]) > abs(r["incumbentEth"] - r["actualEth"]) + 1e-12]
  active = payload["active_predictions"]
  v1 = [r for r in active if r["standard"] == "v1"]
  v2 = [r for r in active if r["standard"] == "v2"]
  active_multiplier = None
  active_market = payload["active_market"]
  if args.remove_asking_floor:
    active_market = {**active_market, "v1_floor_wei": None}
  if args.human_cohort:
    active_run = next(r for r in payload["runs"] if r["active"])
    exact = next(d["value"] for d in v1[0]["drivers_json"] if d.get("kind") == "v1_v2_multiplier")
    active_multiplier = cohort_multiplier(
      sales, payload["dataset"]["traits"], active_market,
      int(active_run["data_cutoff"].timestamp()), exact, reference,
    )
  active_candidate = predict(pipeline, v2, active_market, v1, multiplier=active_multiplier)
  # This replay omits standing bids, which affect quick sale/probability but not
  # the fair value or interval. Validate full bids through build_prediction_run.
  invalid = []
  for r in active_candidate:
    lo, mid, hi = [int(r[k]) for k in ["p10_sale_wei", "p50_sale_wei", "p90_sale_wei"]]
    if not (0 < lo <= mid <= hi and int(r["fair_value_wei"]) > 0 and 0 <= r["sale_probability_24h"] <= 1):
      invalid.append(r["punk_id"])
  archived_by_id = {r["punk_id"]: r for r in v1}
  changed = sum(int(r["fair_value_wei"]) != int(archived_by_id[r["punk_id"]]["fair_value_wei"]) for r in active_candidate)
  report = {"referenceRevision": revision,
    "candidatePipelineSha256": hashlib.sha256(Path(pipeline.__file__).read_bytes()).hexdigest(),
    "candidate": "human_cohort" if args.human_cohort else "floor_deletion" if args.remove_asking_floor else "v1_postprocessing",
    "snapshotSha256": hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
    "cutoff": datetime.fromtimestamp(payload["cutoff"], UTC).isoformat(),
    "replayMismatches": mismatches, "overall": metrics(rows),
    "chronologicalSplit": datetime.fromtimestamp(split, UTC).isoformat(),
    "earlier": metrics([r for r in rows if r["timestamp"] < split]),
    "later": metrics([r for r in rows if r["timestamp"] >= split]),
    "byPunk": {str(p): metrics([r for r in rows if r["punkId"] == p]) for p in sorted({r["punkId"] for r in rows})},
    "salesPerPunk": dict(Counter(str(r["punkId"]) for r in rows)),
    "priceRegressions": price_regressions,
    "activeReplay": {"v1Count": len(active_candidate), "v2Count": len(v2), "changedV1FairValues": changed, "invalidV1Rows": invalid},
    "limitations": ["Repeated sales are dependent; report distinct Punks and chronology rather than treating them as independent trials.",
      "Archive availability begins in June 2026. These are counterfactual replays of a fixed structural correction, not unseen model-selection evidence.",
      "Activation time is approximated by training completion plus a one-minute exclusion guard.",
      "Archived replay omits standing bids for quick sale/probability; fair value and interval must match the served incumbent exactly."],
    "sales": rows}
  if args.full_run:
    report["fullRunValidation"] = full_run(payload, reference)
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(json.dumps(report, indent=2) + "\n")
  print(json.dumps({k: report[k] for k in ["replayMismatches", "overall", "earlier", "later", "salesPerPunk", "priceRegressions", "activeReplay"]}))
  if mismatches or invalid:
    raise SystemExit("Replay validation failed")


if __name__ == "__main__":
  main()
