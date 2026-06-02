import numpy as np
import pandas as pd

from punks_predictor.pipeline import (
  PUNK_COUNT,
  matching_market_bids_by_punk,
  ordered_three,
  v1_v2_multiplier,
)


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
