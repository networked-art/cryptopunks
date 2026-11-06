"""Checks for the research evaluator's leakage and scoring guarantees."""

import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd
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
