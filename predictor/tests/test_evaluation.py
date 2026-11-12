"""Checks for the research evaluator's leakage and scoring guarantees."""

import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.isotonic import isotonic_regression


spec = importlib.util.spec_from_file_location(
  "evaluate_probability", Path(__file__).parents[1] / "scripts/evaluate_probability.py"
)
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def test_probability_projection_matches_isotonic_regression():
  p = np.random.default_rng(1001).uniform(0.02, 0.98, size=(200, 3))
  actual = evaluation.project_curve(p)
  expected = np.array([isotonic_regression(row) for row in p])
  np.testing.assert_allclose(actual, expected)
  for outcome in [(0, 0, 0), (0, 0, 1), (0, 1, 1), (1, 1, 1)]:
    before = np.sum((p - outcome) ** 2, axis=1)
    after = np.sum((actual - outcome) ** 2, axis=1)
    assert np.all(after <= before + 1e-12)


def test_walk_forward_training_uses_only_outcomes_available_at_origin(monkeypatch):
  day = evaluation.F.SECONDS_PER_DAY
  origin = 100 * day
  frame = pd.DataFrame({
    "ts": np.array([0, 69, 70, 92, 93, 98, 99, 100, 101]) * day,
    "next_sale_ts": np.array([10, 110, 110, 110, 110, 110, 110, 110, 110]) * day,
    "sold24h": [0, 0, 0, 0, 0, 0, 0, 0, 0],
    "sold_7d": [0, 0, 0, 0, 0, 0, 0, 0, 0],
    "sold_30d": [1, 0, 0, 1, 1, 1, 1, 1, 1],
  })
  captured = []

  class RecordingModel:
    def fit(self, x, y, sample_weight=None):
      captured.append((x.copy(), y.copy()))
      return self

    def predict(self, x):
      return np.full(len(x), 0.5)

  monkeypatch.setattr(evaluation, "_prob_model", RecordingModel)
  monkeypatch.setattr(evaluation.F, "prob_design", lambda f: f[["ts"]].to_numpy())
  evaluation.fit_predict(frame, origin, origin + 2 * day, "incumbent")
  # All post-origin sale outcomes must be unavailable to the historical model.
  assert captured[2][1].tolist() == [1, 0, 0, 0, 0, 0, 0]
  captured.clear()
  evaluation.fit_predict(frame, origin, origin + 2 * day, "mature")
  assert [len(x) for x, y in captured] == [6, 4, 2]
  assert captured[2][0].ravel().tolist() == [0, 69 * day]


def test_paired_bootstrap_of_identical_forecasts_is_zero():
  frame = pd.DataFrame({"ts": [0, 86_400], "sold24h": [0, 1],
                        "sold_7d": [0, 1], "sold_30d": [1, 1]})
  p = np.array([[0.1, 0.2, 0.3], [0.3, 0.4, 0.5]])
  result = evaluation.paired_interval(frame, p, p)
  assert result == {"candidateMinusIncumbent": 0.0, "dailyBlockBootstrap95": [0.0, 0.0]}


def test_monitoring_window_starts_after_the_previous_final_period():
  previous = {"phase": "final", "folds": [{"end": "2026-10-07T16:25:01+00:00"}]}
  cutoff = int(datetime(2026, 11, 12, 10, 9, 44, tzinfo=UTC).timestamp())
  start, end = evaluation.fresh_probability_window(previous, cutoff)
  assert datetime.fromtimestamp(start, UTC).isoformat() == "2026-10-07T16:25:01+00:00"
  assert datetime.fromtimestamp(end, UTC).isoformat() == "2026-10-13T10:09:44+00:00"
  next_report = {"phase": "monitor", "probability": {"end": datetime.fromtimestamp(end, UTC).isoformat()}}
  assert evaluation.fresh_probability_window(next_report, cutoff) == (end, end)
  assert evaluation.fresh_probability_window(next_report, cutoff-86400) == (end, end)
  with pytest.raises(ValueError, match="final or monitoring"):
    evaluation.fresh_probability_window({"phase": "development", "folds": previous["folds"]}, cutoff)


def test_price_monitor_reports_counts_and_the_published_interval():
  rows = [{"source": "cryptopunks_v2", "punk_id": 7, "ts": 10_000, "run_id": "r",
    "actual_wei": str(10 * 10**18), "fair_value_wei": str(11 * 10**18),
    "p10_sale_wei": str(9 * 10**18), "p90_sale_wei": str(12 * 10**18),
    "training_finished_at": datetime.fromtimestamp(2800, UTC)}]
  runs = {"r": {"metrics_json": {"market": {"v2FloorEth": 10.0}}}}
  result = evaluation.price_summary(rows, runs)
  assert result["n"] == result["distinctPunks"] == 1
  assert result["medianAPE"] == pytest.approx(0.1)
  assert result["valueWeightedError"] == pytest.approx(0.1)
  assert result["intervalCoverage"] == 1
  assert result["medianRelativeIntervalWidth"] == pytest.approx(0.3)
  assert result["meanRelativeIntervalScore80"] == pytest.approx(0.3)
  assert result["predictionAgeHours"]["median"] == 2
  assert result["forecastCohorts"]["nearFloor"]["n"] == 1
  assert 0 < result["coverageWilson95"][0] < 1
