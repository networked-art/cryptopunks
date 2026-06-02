from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta
import os
import sys
import time

from .db import DatabaseConfig
from .pipeline import train_and_store


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(prog="punk-predictor")
  sub = parser.add_subparsers(dest="command", required=True)

  sub.add_parser("run", help="Train once and store a new active prediction run")

  serve = sub.add_parser("serve", help="Run the nightly scheduler")
  serve.add_argument(
    "--hour-utc",
    type=int,
    default=int(os.getenv("PREDICTOR_SCHEDULE_HOUR_UTC", "3")),
    help="UTC hour for the nightly run",
  )
  serve.add_argument(
    "--run-on-start",
    action=argparse.BooleanOptionalAction,
    default=os.getenv("PREDICTOR_RUN_ON_START", "true").lower() != "false",
    help="Run immediately before waiting for the next scheduled run",
  )

  args = parser.parse_args(argv)
  config = DatabaseConfig.from_env()

  if args.command == "run":
    run = train_and_store(config)
    print(
      f"stored prediction run {run.run_id} with {len(run.predictions)} rows",
      flush=True,
    )
    return 0

  if args.command == "serve":
    serve_loop(config, hour_utc=args.hour_utc, run_on_start=args.run_on_start)
    return 0

  parser.error("unknown command")
  return 2


def serve_loop(
  config: DatabaseConfig,
  *,
  hour_utc: int,
  run_on_start: bool,
) -> None:
  if not 0 <= hour_utc <= 23:
    raise ValueError("--hour-utc must be between 0 and 23")

  if run_on_start:
    run_once(config)

  while True:
    now = datetime.now(tz=UTC)
    next_run = now.replace(hour=hour_utc, minute=0, second=0, microsecond=0)
    if next_run <= now:
      next_run += timedelta(days=1)
    sleep_seconds = max(1, int((next_run - now).total_seconds()))
    print(f"next prediction run at {next_run.isoformat()}", flush=True)
    time.sleep(sleep_seconds)
    run_once(config)


def run_once(config: DatabaseConfig) -> None:
  started = datetime.now(tz=UTC)
  print(f"starting prediction run at {started.isoformat()}", flush=True)
  run = train_and_store(config)
  finished = datetime.now(tz=UTC)
  print(
    f"finished prediction run {run.run_id} at {finished.isoformat()} "
    f"({len(run.predictions)} rows)",
    flush=True,
  )


if __name__ == "__main__":
  raise SystemExit(main(sys.argv[1:]))
