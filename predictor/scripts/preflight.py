"""Read-only production checks; load the trusted .env.production before use.

Compare source against the deployed Git revision, since a local review branch
may contain a newer candidate. Credentials and registry tokens are never saved.
"""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
from urllib.request import Request, urlopen


REMOTE = '''import os,json,hashlib,psycopg
from pathlib import Path
from psycopg import sql
from psycopg.rows import dict_row
from punks_predictor import __version__,pipeline
state={"revision":os.environ.get("KAMAL_VERSION"),"packageVersion":__version__,"pipelineSha256":hashlib.sha256(Path(pipeline.__file__).read_bytes()).hexdigest(),"scheduleHourUtc":os.environ.get("PREDICTOR_SCHEDULE_HOUR_UTC")}
with psycopg.connect(os.environ.get("DATABASE_PRIVATE_URL") or os.environ.get("DATABASE_URL"),row_factory=dict_row,connect_timeout=10) as c:
 c.execute("SET TRANSACTION READ ONLY");c.execute("SET LOCAL statement_timeout = '15s'")
 state["databaseTime"]=c.execute("SELECT now() AS t").fetchone()["t"]
 state["newestIndexedEvent"]=c.execute(sql.SQL("SELECT max(timestamp)::bigint AS ts FROM {}.events").format(sql.Identifier(os.environ.get("PONDER_VIEWS_SCHEMA","punks")))).fetchone()["ts"]
 state["activeRun"]=c.execute("SELECT run_id,model_version,data_cutoff,training_finished_at,metrics_json->'promotion' AS promotion FROM offchain.prediction_model_runs WHERE active ORDER BY trained_at DESC LIMIT 1").fetchone()
 state["rows"]=c.execute("""SELECT p.standard,count(*) AS rows,count(DISTINCT p.punk_id) AS distinct_punks,min(p.punk_id)::int AS min_id,max(p.punk_id)::int AS max_id,
 count(*) FILTER (WHERE p.quick_sale_wei<=0 OR p.fair_value_wei<=0 OR p.p10_sale_wei<=0 OR p.p10_sale_wei>p.p50_sale_wei OR p.p50_sale_wei>p.p90_sale_wei OR p.quick_sale_wei>p.p90_sale_wei OR p.sale_probability_24h NOT BETWEEN 0 AND 1 OR p.sale_probability_24h IS NULL) AS invalid
 FROM offchain.punk_predictions p JOIN offchain.prediction_model_runs r USING (run_id) WHERE r.active GROUP BY p.standard ORDER BY p.standard""").fetchall()
print(json.dumps(state,default=str))
'''


def command(args, timeout=20):
  return subprocess.run(args, capture_output=True, text=True, check=True, timeout=timeout).stdout.strip()


def public(path, host="https://indexer.punksmarket.app"):
  request = Request(host + path, headers={"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"})
  with urlopen(request, timeout=20) as response:
    return response.status, response.read()


def registry_push_access():
  username = os.environ["DOCKER_REGISTRY_USERNAME"]
  password = os.environ.get("KAMAL_REGISTRY_PASSWORD")
  if not password:
    password = command([str(Path.home() / ".local/bin/networked-registry-password")], timeout=10)
  auth = base64.b64encode((username + ":" + password).encode()).decode()
  url = "https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + username + "/punk-predictor:pull,push"
  with urlopen(Request(url, headers={"Authorization": "Basic " + auth}), timeout=15) as response:
    token = json.load(response)["token"]
  # Inspect the scope of the token just returned by Docker's authenticated TLS endpoint.
  payload = token.split(".")[1]
  claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
  return any(a.get("name") == username + "/punk-predictor" and "push" in a.get("actions", [])
             for a in claims.get("access", []))


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("output", type=Path)
  args = parser.parse_args()
  ssh = ["ssh", "-oBatchMode=yes", "-oStrictHostKeyChecking=yes", "-oConnectTimeout=10",
         "root@" + os.environ["DEPLOY_HOST"]]
  workers = [json.loads(line) for line in command(
    ssh + ["docker ps --filter name=punk-predictor-worker- --format '{{json .}}'"]
  ).splitlines()]
  if len(workers) != 1:
    raise RuntimeError("Expected exactly one running predictor worker")
  worker = workers[0]
  result = subprocess.run(ssh + ["docker exec -i " + shlex.quote(worker["Names"]) + " .venv/bin/python -"],
    input=REMOTE, capture_output=True, text=True, check=True, timeout=30)
  state = json.loads(result.stdout)
  state["worker"] = {k: worker[k] for k in ["Names", "Image", "Status"]}
  if not re.fullmatch(r"[0-9a-f]{40}", state["revision"] or ""):
    raise RuntimeError("Cannot verify source without a full deployed Git revision")
  source = subprocess.check_output(["git", "show", state["revision"] + ":predictor/src/punks_predictor/pipeline.py"])
  state["sourceMatchesDeployedGit"] = hashlib.sha256(source).hexdigest() == state["pipelineSha256"]
  container, restarts = command(ssh + ["docker inspect --format '{{json .State}} {{.RestartCount}}' " + shlex.quote(worker["Names"])]).rsplit(" ", 1)
  container = json.loads(container)
  state["workerRunning"] = container["Running"] and not container["Restarting"] and not container["OOMKilled"]
  state["restartCount"] = int(restarts)
  status_code, body = public("/status")
  chains = json.loads(body)
  ready_code, _ = public("/ready")
  observed = datetime.now(timezone.utc)
  state["indexerStatus"] = {"ready": ready_code == 200, "observedAt": observed.isoformat(), "chains": chains,
    "headAgeSeconds": observed.timestamp() - chains["mainnet"]["block"]["timestamp"]}
  state["publicModelHosts"] = []
  for host in ["https://indexer.punksmarket.app", "https://indexer.punks.auction"]:
    code, body = public("/predictions/model", host)
    model = json.loads(body)
    if not (code == 200 and model["active"] and model["runId"] == state["activeRun"]["run_id"]):
      raise RuntimeError("Public API and database disagree on the active run")
    state["publicModelHosts"].append({"host": host, "status": code, "runId": model["runId"], "version": model["version"]})
  state["registryAuthenticated"] = registry_push_access()
  state["dockerVersion"] = command(["docker", "info", "--format", "{{.ServerVersion}}"])
  state["kamalVersion"] = command(["kamal", "version"])
  state["gitPushPermission"] = command(["gh", "api", "repos/networked-art/cryptopunks", "--jq", ".permissions.push"]) == "true"
  rows_valid = len(state["rows"]) == 2 and all(
    r["rows"] == r["distinct_punks"] == 10_000 and r["min_id"] == 0 and r["max_id"] == 9999 and r["invalid"] == 0
    for r in state["rows"])
  state["passed"] = (rows_valid and state["sourceMatchesDeployedGit"] and state["workerRunning"]
    and state["registryAuthenticated"] and state["gitPushPermission"] and status_code == 200
    and state["indexerStatus"]["ready"] and 0 <= state["indexerStatus"]["headAgeSeconds"] < 120)
  args.output.parent.mkdir(parents=True, exist_ok=True)
  with args.output.open("w") as stream:
    os.chmod(args.output, 0o600)
    json.dump(state, stream, indent=2)
    stream.write("\n")
  print(json.dumps(state))
  if not state["passed"]:
    raise SystemExit("Production preflight checks failed; inspect the local report")


if __name__ == "__main__":
  main()
