"""Export a trusted, local-only research snapshot through the production worker.

Load the trusted .env.production before invocation. No database writes or
training runs are performed. The pickle must only be read from a trusted source.
"""

import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess


REMOTE = r'''
import gzip, pickle, sys
from datetime import UTC, datetime
from psycopg import sql
from punks_predictor.db import DatabaseConfig, connect
from punks_predictor.pipeline import load_dataset

config = DatabaseConfig.from_env()
with connect(config) as conn:
  conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  conn.execute("SET LOCAL statement_timeout = '90s'")
  cutoff = conn.execute("SELECT extract(epoch FROM now())::bigint AS ts").fetchone()["ts"]
  dataset = load_dataset(conn, config.views_schema)
  runs = conn.execute("SELECT run_id, trained_at, training_finished_at, data_cutoff, active, metrics_json FROM offchain.prediction_model_runs ORDER BY trained_at").fetchall()
  realized = conn.execute(sql.SQL("""
    SELECT e.source, e.punk_id, e.timestamp::bigint AS ts,
      e.wei_amount::text AS actual_wei, r.run_id, r.training_finished_at,
      p.fair_value_wei::text, p.p10_sale_wei::text, p.p90_sale_wei::text,
      p.confidence
    FROM {}.events e
    JOIN LATERAL (
      SELECT run_id, training_finished_at FROM offchain.prediction_model_runs
      WHERE (metrics_json->'promotion'->>'promote')::boolean = true
        AND training_finished_at < to_timestamp(e.timestamp::bigint)
      ORDER BY training_finished_at DESC LIMIT 1
    ) r ON true
    JOIN offchain.punk_predictions p ON p.run_id = r.run_id
      AND p.punk_id = e.punk_id
      AND p.standard = CASE WHEN e.source = 'cryptopunks_v2' THEN 'v2' ELSE 'v1' END
    WHERE e.type = 'sale' AND e.wei_amount > 0
      AND e.source IN ('cryptopunks_v2', 'cryptopunks_v1', 'punks_market')
      AND e.timestamp::bigint >= %s - 90 * 86400
      AND e.timestamp::bigint > extract(epoch FROM r.training_finished_at) + 60
    ORDER BY e.timestamp
  """).format(sql.Identifier(config.views_schema)), (cutoff,)).fetchall()
  payload = {"cutoff": int(cutoff), "dataset": dataset, "runs": runs,
    "realized": realized, "captured_at": datetime.now(UTC).isoformat()}
  payload["v1_replay"] = conn.execute(sql.SQL("""
    SELECT e.source, e.punk_id, e.timestamp::bigint AS ts, e.tx_hash,
      e.wei_amount::text AS actual_wei, r.run_id, r.training_finished_at,
      row_to_json(v1) AS v1_prediction, row_to_json(v2) AS v2_prediction,
      row_to_json(m) AS market
    FROM {}.events e
    JOIN LATERAL (
      SELECT run_id, training_finished_at FROM offchain.prediction_model_runs
      WHERE (metrics_json->'promotion'->>'promote')::boolean = true
        AND training_finished_at < to_timestamp(e.timestamp::bigint)
      ORDER BY training_finished_at DESC LIMIT 1
    ) r ON true
    JOIN offchain.punk_predictions v1 ON v1.run_id = r.run_id
      AND v1.standard = 'v1' AND v1.punk_id = e.punk_id
    JOIN offchain.punk_predictions v2 ON v2.run_id = r.run_id
      AND v2.standard = 'v2' AND v2.punk_id = e.punk_id
    JOIN offchain.prediction_market_context m ON m.run_id = r.run_id
    WHERE e.type = 'sale' AND e.wei_amount > 0
      AND e.source IN ('cryptopunks_v1', 'punks_market')
      AND e.timestamp::bigint > extract(epoch FROM r.training_finished_at) + 60
    ORDER BY e.timestamp, e.tx_hash
  """).format(sql.Identifier(config.views_schema))).fetchall()
  payload["active_predictions"] = conn.execute("""
    SELECT p.* FROM offchain.punk_predictions p
    JOIN offchain.prediction_model_runs r USING (run_id)
    WHERE r.active ORDER BY p.standard, p.punk_id
  """).fetchall()
  payload["active_market"] = conn.execute("""
    SELECT m.* FROM offchain.prediction_market_context m
    JOIN offchain.prediction_model_runs r USING (run_id) WHERE r.active
  """).fetchone()
with gzip.GzipFile(fileobj=sys.stdout.buffer, mode="wb") as stream:
  pickle.dump(payload, stream, protocol=5)
'''


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("output", type=Path)
  args = parser.parse_args()
  host = os.environ["DEPLOY_HOST"]
  ssh = ["ssh", "-oBatchMode=yes", "-oStrictHostKeyChecking=yes",
         "-oConnectTimeout=10", f"root@{host}"]
  result = subprocess.run(
    ssh + ["docker ps --filter name=punk-predictor-worker- --format '{{.Names}}'"],
    check=True, capture_output=True, text=True, timeout=20,
  )
  names = result.stdout.splitlines()
  if len(names) != 1:
    raise RuntimeError("Expected exactly one running predictor worker")
  args.output.parent.mkdir(parents=True, exist_ok=True)
  temporary = args.output.with_suffix(".partial")
  try:
    with temporary.open("wb") as stream:
      os.chmod(temporary, 0o600)
      subprocess.run(
        ssh + [f"docker exec -i {shlex.quote(names[0])} .venv/bin/python -"],
        input=REMOTE.encode(), stdout=stream, check=True, timeout=240,
      )
    temporary.replace(args.output)
  finally:
    temporary.unlink(missing_ok=True)
  print(json.dumps({"worker": names[0], "snapshot": str(args.output),
                    "bytes": args.output.stat().st_size}))


if __name__ == "__main__":
  main()
