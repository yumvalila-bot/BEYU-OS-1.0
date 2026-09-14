#!/usr/bin/env bash
# =============================================================================
# BEYU OS — GOVERNED DEPLOYMENT PIPELINE (X10THINK §38)
#
#   VALIDATE → AUTHORIZATION → LINT → TYPECHECK → TEST → SECURITY (secrets) →
#   MIGRATION VALIDATION → BUILD → ARTIFACT VERIFICATION → DEPLOY → EVIDENCE
#
# FAIL CLOSED: every gate must pass for the pipeline to continue. A failing gate
# stops the run with a non-zero exit and an evidence bundle; nothing is deployed
# on a failed, skipped or unproven gate.
#
# AUTHORIZATION BOUNDARY (never fabricated):
#   The DEPLOY step requires explicit operator authorization AND live provider
#   credentials (e.g. VERCEL_TOKEN / cloud CLI login). When they are absent the
#   pipeline completes every independent gate, writes the evidence bundle and
#   stops at the deploy step with:
#       BLOCKED — EXTERNAL DEPENDENCY (deployment credentials/authorization)
#   It never invents credentials, never simulates a deployment and never
#   reports a production success that did not happen (§55, §59).
#
# EVIDENCE: every gate writes its full log plus a SHA-256 checksum into
#   tmp/deploy-evidence/<timestamp>/   (git-ignored; retention per policy)
# so a deployment can later answer: WHO / WHAT / WHEN / WHY / PROVEN? (§61)
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="tmp/deploy-evidence/$TIMESTAMP"
mkdir -p "$EVIDENCE_DIR"

GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo UNKNOWN)"
GIT_DIRTY="$(git status --porcelain | head -1 || true)"

RESULTS_FILE="$EVIDENCE_DIR/results.txt"
: > "$RESULTS_FILE"

log()  { printf '[deploy %s] %s\n' "$TIMESTAMP" "$*" | tee -a "$EVIDENCE_DIR/pipeline.log"; }
gate() { # gate <NAME> <cmd...>
  local name="$1"; shift
  log "GATE $name — start"
  if "$@" > "$EVIDENCE_DIR/$name.log" 2>&1; then
    local sum; sum="$(sha256sum "$EVIDENCE_DIR/$name.log" | cut -d' ' -f1)"
    echo "PASS $name log_sha256=$sum" >> "$RESULTS_FILE"
    log "GATE $name — PASS (evidence sha256:$sum)"
  else
    local sum; sum="$(sha256sum "$EVIDENCE_DIR/$name.log" | cut -d' ' -f1)"
    echo "FAIL $name log_sha256=$sum" >> "$RESULTS_FILE"
    log "GATE $name — FAIL (see $EVIDENCE_DIR/$name.log)"
    log "PIPELINE FAILED CLOSED at gate $name. Nothing was deployed."
    exit 1
  fi
}

log "commit=$GIT_COMMIT branch=$GIT_BRANCH dirty='${GIT_DIRTY:+yes}'"
{
  echo "git_commit=$GIT_COMMIT"
  echo "git_branch=$GIT_BRANCH"
  echo "git_dirty=${GIT_DIRTY:+yes}"
  echo "requested_by=${USER:-unknown}"
  echo "started_at=$TIMESTAMP"
} >> "$RESULTS_FILE"

# --- GATE 1: VALIDATE — working tree must be clean for a governed deploy -----
if [ -n "$GIT_DIRTY" ] && [ "${ALLOW_DIRTY_TREE:-0}" != "1" ]; then
  log "GATE validate — FAIL: working tree is dirty. Commit or stash first (set ALLOW_DIRTY_TREE=1 only for drills)."
  echo "FAIL validate dirty_tree" >> "$RESULTS_FILE"
  exit 1
fi
echo "PASS validate clean_tree" >> "$RESULTS_FILE"

# --- GATE 2: LINT / TYPECHECK ------------------------------------------------
gate lint        npm run lint
gate typecheck   npx tsc --noEmit

# --- GATE 3: TEST ------------------------------------------------------------
gate test        npx vitest run

# --- GATE 4: SECURITY — committed-secret scan (fail closed) ------------------
gate secrets     node scripts/scan-secrets.mjs

# --- GATE 5: MIGRATION VALIDATION --------------------------------------------
# The canonical runner is checksum-guarded and idempotent; running it against
# the configured target validates that migrations apply cleanly and in order.
# Against production this MUST use BEYU_ADMIN_DATABASE_URL (migration role).
if [ -n "${BEYU_ADMIN_DATABASE_URL:-}" ] || [ -n "${DATABASE_URL:-}" ]; then
  gate migrate   npm run migrate
else
  log "GATE migrate — FAIL: no BEYU_ADMIN_DATABASE_URL / DATABASE_URL configured. Refusing to validate migrations blind."
  echo "FAIL migrate no_dsn" >> "$RESULTS_FILE"
  exit 1
fi

# --- GATE 6: BUILD -----------------------------------------------------------
gate build       npm run build

# --- GATE 7: ARTIFACT VERIFICATION -------------------------------------------
if [ -d ".next" ] && [ -f ".next/BUILD_ID" ]; then
  BUILD_ID="$(cat .next/BUILD_ID)"
  echo "PASS artifact build_id=$BUILD_ID" >> "$RESULTS_FILE"
  log "GATE artifact — PASS (BUILD_ID=$BUILD_ID)"
else
  log "GATE artifact — FAIL: build artifacts not found."
  echo "FAIL artifact missing" >> "$RESULTS_FILE"
  exit 1
fi

# --- GATE 8: DEPLOY — external authorization boundary -------------------------
# Real deployment requires provider credentials this repository must never
# contain. When absent, the pipeline reports the blocker honestly (§59) and
# exits non-zero: a blocked deploy is NOT a successful deploy.
if [ "${BEYU_DEPLOY_AUTHORIZED:-0}" = "1" ] && [ -n "${VERCEL_TOKEN:-}" ]; then
  gate deploy npx vercel deploy --prod --token "$VERCEL_TOKEN"
  echo "PASS deploy provider=vercel" >> "$RESULTS_FILE"
  log "GATE deploy — PASS"
else
  log "GATE deploy — BLOCKED — EXTERNAL DEPENDENCY"
  log "  Deployment requires: BEYU_DEPLOY_AUTHORIZED=1 (operator authorization)"
  log "  and a live VERCEL_TOKEN (production credential). Neither is fabricated."
  echo "BLOCKED deploy external_dependency_credentials_and_authorization" >> "$RESULTS_FILE"
fi

# --- EVIDENCE BUNDLE -----------------------------------------------------------
{
  echo "finished_at=$(date -u +%Y%m%dT%H%M%SZ)"
  echo "evidence_dir=$EVIDENCE_DIR"
} >> "$RESULTS_FILE"
sha256sum "$RESULTS_FILE" > "$EVIDENCE_DIR/results.sha256"
log "Evidence bundle: $EVIDENCE_DIR"
log "DEPLOYMENT PIPELINE COMPLETE (deploy step status recorded in results.txt)."

if grep -q "^BLOCKED deploy" "$RESULTS_FILE"; then
  exit 2   # blocked ≠ success; callers must treat this as not-deployed
fi
