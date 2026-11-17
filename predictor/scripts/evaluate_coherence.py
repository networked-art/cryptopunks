"""Validate the fixed serving correction on fresh outcomes and frozen inputs."""

import argparse
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP
import gzip
import hashlib
import json
from pathlib import Path
import pickle

import numpy as np

from punks_predictor import pipeline
from evaluate_probability import (
  load_frame, fit_predict, metrics, paired_interval, fresh_probability_window,
)
from evaluate_v1 import reference_module, build_frozen_runs


def curve_driver(row):
  return next((d for d in row["drivers_json"] if d.get("kind") == "sale_probability"), None)


def published_curve(row):
  driver = curve_driver(row)
  return [float(row["sale_probability_24h"]), driver["day7"], driver["day30"]]


def violations(curves):
  return int(np.sum(np.any(np.diff(curves, axis=1) < 0, axis=1)))


def frozen_validation(payload, reference):
  incumbent, candidate = build_frozen_runs(payload, reference)
  key = lambda r: (r["standard"], int(r["punk_id"]))
  old = {key(r): r for r in incumbent.predictions}
  new = {key(r): r for r in candidate.predictions}
  assert len(old) == len(new) == len(candidate.predictions) == 20_000 and old.keys() == new.keys()
  price_fields = ["quick_sale_wei", "fair_value_wei", "p10_sale_wei", "p50_sale_wei", "p90_sale_wei"]
  invalid = []
  changed_prices = []
  changed_v1_day1 = []
  v1_curves = []
  v2_curves = []
  for identity, row in new.items():
    before = old[identity]
    if any(row[k] != before[k] for k in price_fields):
      changed_prices.append(identity)
    lo, mid, hi = [int(row[k]) for k in ["p10_sale_wei", "p50_sale_wei", "p90_sale_wei"]]
    if not (0 < lo <= mid <= hi and int(row["fair_value_wei"]) > 0
            and 0 < int(row["quick_sale_wei"]) <= hi
            and np.isfinite(row["sale_probability_24h"])
            and 0 <= row["sale_probability_24h"] <= 1):
      invalid.append(identity)
    if row["standard"] == "v1":
      if row["sale_probability_24h"] != before["sale_probability_24h"]:
        changed_v1_day1.append(identity)
      if curve_driver(row):
        v1_curves.append(identity)
    else:
      curve = published_curve(row)
      # Simulate the existing numeric(8,6) scalar storage beside JSON drivers.
      curve[0] = float(Decimal(str(curve[0])).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))
      v2_curves.append(curve)
    relevant_before = [d for d in before["drivers_json"] if d.get("kind") != "sale_probability"]
    relevant_after = [d for d in row["drivers_json"] if d.get("kind") != "sale_probability"]
    assert relevant_before == relevant_after
  incoherent = violations(np.array(v2_curves))
  assert not (invalid or changed_prices or changed_v1_day1 or v1_curves or incoherent)
  prices = [[identity, [new[identity][k] for k in price_fields]] for identity in sorted(new)]
  return {"predictionCount": len(new), "changedPriceRows": len(changed_prices),
    "changedV1Day1Rows": len(changed_v1_day1), "v1CurveDrivers": len(v1_curves),
    "v2CurveCount": len(v2_curves), "incoherentPublishedV2Curves": incoherent,
    "invalidRows": invalid, "priceFieldsSha256": hashlib.sha256(json.dumps(prices).encode()).hexdigest(),
    "incumbentPriceMetrics": incumbent.metrics["model"], "candidatePriceMetrics": candidate.metrics["model"]}


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("snapshot", type=Path)
  parser.add_argument("--previous-report", type=Path, required=True)
  parser.add_argument("--reference-revision", required=True)
  parser.add_argument("--full-run", action="store_true")
  parser.add_argument("--output", type=Path, required=True)
  args = parser.parse_args()
  with gzip.open(args.snapshot, "rb") as stream:
    payload = pickle.load(stream)
  previous = json.loads(args.previous_report.read_text())
  start, end = fresh_probability_window(previous, payload["cutoff"])
  if end <= start:
    raise SystemExit("No fresh, fully matured evaluation period")
  frame = load_frame(args.snapshot, payload)
  if frame[(frame["ts"] >= start) & (frame["ts"] < end)].empty:
    raise SystemExit("No fresh eligible listings")
  hold, raw, counts = fit_predict(frame, start, end, "incumbent")
  projected = np.round(pipeline.coherent_probability_curve(raw), 6)
  before, after = metrics(hold, raw), metrics(hold, projected)
  active = [r for r in payload["active_predictions"] if r["standard"] == "v2"]
  raw_active = np.array([[curve_driver(r)[k] for k in ["day1", "day7", "day30"]] for r in active])
  published = np.array([published_curve(r) for r in active])
  corrected = np.round(pipeline.coherent_probability_curve(raw_active), 6)
  exact_projection = pipeline.coherent_probability_curve(raw_active)
  worst_delta = max(float(np.max(np.sum((exact_projection-y)**2 - (raw_active-y)**2, axis=1)))
                    for y in [(0,0,0), (0,0,1), (0,1,1), (1,1,1)])
  gates = {
    "activeCurvesCumulative": violations(corrected) == 0,
    "activeCurvesBounded": bool(np.isfinite(corrected).all() and np.all((0 <= corrected) & (corrected <= 1))),
    "projectionNestedOutcomeProperty": worst_delta <= 1e-12,
    "freshMeanBrierWithinPrecision": after["meanBrier"] <= before["meanBrier"] + 0.000001,
    "freshDay1NonRegression": after["sold24h"]["brier"] <= before["sold24h"]["brier"] * 1.01,
  }
  report = {"referenceRevision": args.reference_revision, "candidateVersion": pipeline.MODEL_VERSION,
    "snapshotSha256": hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
    "candidatePipelineSha256": hashlib.sha256(Path(pipeline.__file__).read_bytes()).hexdigest(),
    "evaluatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "probability": {"start": previous["probability"]["end"],
      "end": datetime.fromtimestamp(end, UTC).isoformat(),
      "incumbent": before, "candidate": after, "trainRowsByHorizon": counts,
      "distinctPunks": int(hold["punk_id"].nunique()), "comparison": paired_interval(hold, raw, projected)},
    "activeSnapshot": {"v2Count": len(active), "incoherentRawCurves": violations(raw_active),
      "incoherentPublishedCurves": violations(published), "incoherentCorrectedCurves": violations(corrected),
      "v1InheritedCurves": sum(r["standard"] == "v1" and curve_driver(r) is not None for r in payload["active_predictions"]),
      "worstUnroundedSquaredErrorDeltaOverNestedOutcomes": worst_delta,
      "maxQuantizationChange": float(np.max(abs(exact_projection-corrected)))},
    "gates": gates, "acceptedForReview": all(gates.values()),
    "limitations": ["This is an inference-only correctness correction; no fitting, label, calibration or promotion changes.",
      "Equal-weight projection improves summed squared error before finite-precision rounding, not necessarily each horizon separately.",
      "Fresh listing replay is not evidence of calibration for hypothetical live quick-sale asks.",
      "V1 has no learned seven-day or 30-day probability model. Suppressing inherited V2 curves leaves V1 prices and its 24-hour heuristic unchanged."]}
  if args.full_run and report["acceptedForReview"]:
    _, reference = reference_module(args.reference_revision, args.snapshot.parent)
    report["fullRunValidation"] = frozen_validation(payload, reference)
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(json.dumps(report, indent=2) + "\n")
  print(json.dumps({k:report[k] for k in ["probability", "activeSnapshot", "gates", "acceptedForReview"]}),flush=True)
  if not report["acceptedForReview"]:
    raise SystemExit("Correction did not pass the registered checks")


if __name__ == "__main__":
  main()
