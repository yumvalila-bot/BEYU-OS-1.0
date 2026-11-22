#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

echo "Installing the exact dependency graph from package-lock.json..."
npm ci

if [[ ! -f .env ]]; then
  umask 077
  gen_ephemeral_token() {
    node -e "process.stdout.write(require('node:crypto').randomBytes(${1}).toString('${2}'))"
  }
  runtime_pwd="$(gen_ephemeral_token 24 base64url)"
  governance_pwd="$(gen_ephemeral_token 24 base64url)"
  bootstrap_pwd="$(gen_ephemeral_token 32 base64url)"
  auth_secret="$(gen_ephemeral_token 32 hex)"
  mfa_key="$(gen_ephemeral_token 32 hex)"

  cat > .env <<EOF
# Generated inside this Codespace. Disposable credentials; never copy to production.
BEYU_CLOUD_DEV_ENV=1
BEYU_ENV=development
DATABASE_URL=postgresql://beyu_runtime:${runtime_pwd}@127.0.0.1:5432/beyu_os
BEYU_RUNTIME_DATABASE_URL=postgresql://beyu_runtime:${runtime_pwd}@127.0.0.1:5432/beyu_os
BEYU_GOVERNANCE_DATABASE_URL=postgresql://beyu_governance:${governance_pwd}@127.0.0.1:5432/beyu_os
BEYU_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beyu_os
BEYU_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beyu_os
BEYU_RUNTIME_DB_PASSWORD=${runtime_pwd}
BEYU_GOVERNANCE_DB_PASSWORD=${governance_pwd}
BEYU_BOOTSTRAP_PASSWORD=${bootstrap_pwd}
AUTH_SECRET=${auth_secret}
MFA_ENCRYPTION_KEY=${mfa_key}
BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1
BEYU_TEST_BASE_URL=http://127.0.0.1:3100
NODE_OPTIONS=--max-old-space-size=4096
EOF
  chmod 600 .env
else
  echo "An existing .env was found. It will not be overwritten; only a generated, loopback-only Codespaces .env is accepted." >&2
fi

echo "Checking that every configured database connection is loopback-only..."
node <<'NODE'
const fs = require("node:fs");
const { parse } = require("dotenv");
const env = parse(fs.readFileSync(".env"));
if (env.BEYU_CLOUD_DEV_ENV !== "1") {
  throw new Error("Refusing Codespaces bootstrap: .env is not generated for cloud development.");
}
if (env.BEYU_ENV === "production" || env.NODE_ENV === "production") {
  throw new Error("Refusing Codespaces bootstrap in production mode.");
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
for (const key of ["BEYU_RUNTIME_DB_PASSWORD", "BEYU_GOVERNANCE_DB_PASSWORD", "BEYU_BOOTSTRAP_PASSWORD", "AUTH_SECRET", "MFA_ENCRYPTION_KEY"]) {
  if (!env[key] || env[key].length < 14) throw new Error("Required generated development secret " + key + " is missing or too short.");
}
NODE

echo "Installing the Chromium version pinned by @playwright/test..."
npx playwright install --with-deps chromium

echo "Starting the isolated embedded PostgreSQL 16 instance..."
bash scripts/infra/codespaces-start.sh

echo "Applying canonical migrations to the disposable Codespaces database..."
npm run migrate

echo "Provisioning the restricted BEYU runtime role..."
npx tsx scripts/setup-db-role.ts

echo "Provisioning the restricted governed-mutation role..."
npm run db:setup-governance-role

echo "Seeding disposable development identities and reference data..."
npm run seed

echo "BEYU cloud development environment is ready."
echo "Start the app with: npm run dev -- --hostname 0.0.0.0 --port 3100"
