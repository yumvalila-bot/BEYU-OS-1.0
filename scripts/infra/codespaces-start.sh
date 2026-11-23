#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ ! -f .env ]]; then
  echo "BEYU Codespaces environment is not initialized (.env is missing)." >&2
  exit 1
fi

node <<'NODE'
const fs = require("node:fs");
const { parse } = require("dotenv");
const env = parse(fs.readFileSync(".env"));
if (env.BEYU_CLOUD_DEV_ENV !== "1") {
  throw new Error("Refusing to start Codespaces PostgreSQL: .env is not marked as a generated cloud-development environment.");
}
if (env.BEYU_ENV === "production" || env.NODE_ENV === "production") {
  throw new Error("Refusing to start Codespaces PostgreSQL with production mode enabled.");
}
for (const key of [
  "DATABASE_URL",
  "BEYU_RUNTIME_DATABASE_URL",
  "BEYU_GOVERNANCE_DATABASE_URL",
  "BEYU_ADMIN_DATABASE_URL",
  "BEYU_TEST_DATABASE_URL"
]) {
  if (!env[key]) throw new Error("Required local database setting " + key + " is missing.");
  const url = new URL(env[key]);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Refusing non-loopback database host in " + key + ".");
  }
}
NODE

mkdir -p tmp pgdata

pg_ready() {
  node -e 'const { Client } = require("pg"); const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/postgres" }); c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));' >/dev/null 2>&1
}

if [[ -f pgdata/pg16.pid ]]; then
  existing_pid="$(cat pgdata/pg16.pid 2>/dev/null || true)"
  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    for _ in {1..20}; do
      if pg_ready; then
        echo "BEYU disposable PostgreSQL 16 is already running."
        exit 0
      fi
      sleep 1
    done
  fi
  rm -f pgdata/pg16.pid
fi

log_file="tmp/codespaces-pg16.log"
nohup node scripts/infra/pg16-server.mjs start >"$log_file" 2>&1 </dev/null &
server_pid=$!

for _ in {1..120}; do
  if grep -q "^PG16_READY$" "$log_file" 2>/dev/null; then
    echo "BEYU disposable PostgreSQL 16 is ready on 127.0.0.1:5432."
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "BEYU PostgreSQL failed to start. Last log lines:" >&2
    tail -n 80 "$log_file" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "Timed out waiting for BEYU PostgreSQL 16." >&2
tail -n 80 "$log_file" >&2 || true
exit 1
