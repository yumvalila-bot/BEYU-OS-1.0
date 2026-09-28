#!/usr/bin/env node
/**
 * BEYU Health OS — READ-ONLY deployment verification probe.
 *
 * Issues only unauthenticated HTTP GETs. It never sends credentials, never
 * writes, never registers or links identities, and never touches a database.
 * It turns "is the Health backend deployed and wired?" into evidence:
 *
 *   backend  GET /health/live              → 200
 *   backend  GET /health/ready             → 200, migrations.status "up",
 *                                            ledger_fingerprint == fingerprint of
 *                                            THIS checkout's database/migrations
 *   backend  GET /auth/me                  → 401 (auth enforced)
 *   backend  GET /api/patients             → 401 (auth enforced)
 *   BEYU     GET /health-os/auth/me        → 401 from the Health backend
 *                                            (404 = HEALTH_API_URL proxy absent)
 *
 * Usage:
 *   node scripts/verify-deployment.mjs --backend https://<health-host> \
 *        [--beyu https://<beyu-host>] [--json]
 *
 * Exit code 0 only when every executed check passes. A check that cannot run
 * is reported NOT_VERIFIED, never PASS.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, "..", "database", "migrations");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Same algorithm as src/database/migration-governance.ts. */
export function sourceFingerprint(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".up.sql")).sort();
  const sums = files.map((f) =>
    createHash("sha256").update(readFileSync(join(dir, f), "utf8")).digest("hex"),
  );
  return {
    count: files.length,
    fingerprint: createHash("sha256").update(sums.join("\n")).digest("hex"),
  };
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: ctl.signal });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const backend = arg("backend")?.replace(/\/+$/, "");
  const beyu = arg("beyu")?.replace(/\/+$/, "");
  if (!backend && !beyu) {
    console.error("usage: verify-deployment.mjs --backend <url> [--beyu <url>] [--json]");
    process.exit(2);
  }
  const expected = sourceFingerprint();
  const results = [];
  const add = (id, verdict, detail) => results.push({ id, verdict, detail });

  if (backend) {
    const live = await get(`${backend}/health/live`);
    add("backend.live", live.status === 200 ? "PASS" : live.status ? "FAIL" : "NOT_VERIFIED", {
      status: live.status,
      error: live.error,
    });

    const ready = await get(`${backend}/health/ready`);
    const m = ready.json?.checks?.migrations ?? (ready.json?.message?.checks?.migrations) ?? {};
    const fpOk =
      m.status === "up" &&
      m.ledger_fingerprint === expected.fingerprint &&
      m.expected_fingerprint === expected.fingerprint &&
      m.applied === expected.count;
    add(
      "backend.ready",
      ready.status === 200 && fpOk ? "PASS" : ready.status ? "FAIL" : "NOT_VERIFIED",
      {
        status: ready.status,
        migrations: {
          status: m.status,
          reasons: m.reasons,
          applied: m.applied,
          latest: m.latest,
          ledger_fingerprint: m.ledger_fingerprint,
        },
        expected_fingerprint: expected.fingerprint,
        expected_count: expected.count,
        error: ready.error,
      },
    );

    for (const p of ["/auth/me", "/api/patients"]) {
      const r = await get(`${backend}${p}`);
      add(`backend.unauthenticated${p}`, r.status === 401 ? "PASS" : r.status ? "FAIL" : "NOT_VERIFIED", {
        status: r.status,
        error: r.error,
      });
    }
  }

  if (beyu) {
    const r = await get(`${beyu}/health-os/auth/me`);
    add(
      "beyu.health_proxy",
      r.status === 401 ? "PASS" : r.status ? "FAIL" : "NOT_VERIFIED",
      {
        status: r.status,
        hint:
          r.status === 404
            ? "HEALTH_API_URL was not set when the BEYU deployment was built (proxy absent)"
            : undefined,
        error: r.error,
      },
    );
  }

  const ok = results.every((r) => r.verdict === "PASS");
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok, results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.verdict.padEnd(13)} ${r.id}  ${JSON.stringify(r.detail)}`);
    console.log(ok ? "\nALL CHECKS PASS" : "\nNOT VERIFIED / FAILING — see above");
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
