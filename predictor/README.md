# networked-punks-predictor

Nightly worker that predicts the 24-hour sale value of every CryptoPunk and
publishes the results back to the indexer's database.

Each run trains a gradient-boosted model on recent V2 sales, derives V1
valuations from the V2 estimate times a live liquidity multiplier, and writes a
per-Punk forecast — quick-sale price, fair value, a p10/p50/p90 band, and a
24-hour sale probability — into the `offchain` schema. The indexer serves those
rows at `GET /predictions/v2/:id` and `GET /predictions/v1/:id`.

## Data source

The predictor has **no data of its own** — it reads everything live from the
indexer's Ponder views at run time:

- It connects to the **same database as the indexer** (`DATABASE_URL`) and reads
  the stable `PONDER_VIEWS_SCHEMA` views (`punks` by default): `events`,
  `listings` / `v1_listings`, `punk_bids` / `v1_punk_bids`, `market_bids`,
  `punk_traits`, `punk_visuals`, `punk_colors`.
- Every run uses a `data_cutoff` of "now", so it always trains on whatever the
  indexer has synced up to the moment training starts. There is no cache or
  snapshot — if the indexer lags chain head, the predictor inherits that lag.

So a fresh run only reflects new market activity once the indexer has indexed
it. Make sure `../indexer` is running and synced before reading anything into
the model.

## Requirements

- Python 3.12 (`>=3.12,<3.13`)
- [uv](https://docs.astral.sh/uv/)
- A reachable indexer database (see `../indexer`)

## Setup

```sh
uv sync                 # install dependencies into .venv
cp .env.example .env    # then point DATABASE_URL at your indexer DB
```

`.env` is loaded automatically when present. Configuration:

| Variable                      | Default          | Purpose                                                              |
| ----------------------------- | ---------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                | —                | Postgres URL of the indexer DB. Required.                           |
| `PONDER_VIEWS_SCHEMA`         | `punks`          | Schema holding the indexer's published views.                       |
| `PREDICTOR_RUN_ON_START`      | `true`           | `serve` trains once immediately before scheduling. `run` ignores it.|
| `PREDICTOR_SCHEDULE_HOUR_UTC` | `3`              | UTC hour for the nightly `serve` run.                               |

`DATABASE_PRIVATE_URL` and `PREDICTOR_DATABASE_URL` are accepted as fallbacks
for `DATABASE_URL`, in that order.

## Running

Train once and store a new prediction run, then exit:

```sh
uv run punk-predictor run
```

Run the nightly scheduler (this is the container's default command):

```sh
uv run punk-predictor serve                 # train on start, then nightly at hour 3 UTC
uv run punk-predictor serve --hour-utc 5 --no-run-on-start
```

Each run prints its `run_id`, row count, and promotion decision, e.g.:

```
stored prediction run 20260602T232554Z-8c8dc619 with 20000 rows (kept inactive: does not beat the median baseline)
```

## Output

A run writes to four tables in the `offchain` schema, all keyed by `run_id`:

- `prediction_model_runs` — one row per run with metrics, config, and the
  `active` flag.
- `prediction_market_context` — the floor/bid/liquidity snapshot the run trained
  against.
- `punk_predictions` — one row per Punk (`quick_sale_wei`, `fair_value_wei`,
  `p10/p50/p90_sale_wei`, `sale_probability_24h`, `confidence`, plus driver,
  comp, trait-premium, and market-context JSON).
- `prediction_backtests` — the out-of-time model metrics and the baseline
  metrics it is graded against.

### Promotion

Every run is stored, but only a promoted run becomes the one served. A new run
is promoted (and the previous active run superseded) when it:

1. has a holdout evaluation (`testCount > 0`),
2. beats the median-price baseline on holdout median absolute percent error, and
3. does not regress more than 5% (`PROMOTION_REGRESSION_TOLERANCE`) against the
   currently active run.

The first ever run is promoted unconditionally (bootstrap). A run that fails any
check is still stored as `superseded` — useful for inspection — but the live
predictions are left untouched.

## Tests

```sh
uv run pytest
```

## Deployment

The worker deploys with [Kamal](https://kamal-deploy.org) (`config/deploy.yml`,
built from `../Dockerfile.predictor` with the repo root as context). It runs on
the indexer's host and joins the `shared` Docker network so it can reach the
`indexer-db` container.

Configure `.env.production` from `.env.production.example` (it provides
`DEPLOY_HOST`, `DOCKER_REGISTRY_USERNAME`, and the production `DATABASE_URL`),
export `KAMAL_REGISTRY_PASSWORD`, then from this directory:

```sh
set -a; source .env.production; set +a
kamal deploy
```

To recompute the model in production immediately without redeploying, run the
one-off `run` command inside the live worker container:

```sh
kamal app exec --reuse "uv run punk-predictor run"
```

This trains against the indexer's current data and applies the same promotion
gate as a scheduled run.
