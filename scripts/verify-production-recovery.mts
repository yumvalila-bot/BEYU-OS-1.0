/**
 * BEYU OS — post-release recovery verification (READ ONLY).
 *
 * WHAT THIS IS
 *   A dependency-free checker an authorised operator runs AFTER the governed
 *   database release (db-release.yml, mode=deploy) and the application
 *   deployment have been separately approved and completed. It answers one
 *   question: "is production actually recovered, and did any governance
 *   boundary move?"
 *
 * WHAT IT DOES — every request is a GET, and nothing is mutated.
 *   1. liveness/readiness            GET {base}/api/health
 *   2. release identity              GET {base}/api/health/identity
 *   3. schema provenance             GET {base}/api/health/schema
 *   4. destination entries           GET {origin}/ on each canonical host
 *   5. anonymous deep links          GET {origin}/os, /os/<destination>
 *   6. failure-signature scan        every fetched body is scanned for the
 *                                    reported load-failure screen and for a
 *                                    leaked SQLSTATE 42703 / global_scope name
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   * no authentication, no credentials, no cookies, no session material;
 *   * no POST/PUT/PATCH/DELETE — so it cannot post a journal entry, create an
 *     identity link, approve anything or change a setting;
 *   * it does NOT prove that an authorised, entitled synthetic user can sign in
 *     and load a destination. That requires a synthetic account and is a
 *     separate, explicitly authorised human step (see
 *     docs/runbooks/RB-025-post-billing-release-recovery.md, Gate 7). A skipped
 *     check is reported as NOT RUN — never as a pass.
 *
 * USAGE
 *   npx tsx scripts/verify-production-recovery.mts --base-url https://beyu.co.tz
 *   npx tsx scripts/verify-production-recovery.mts --list          # dry run: show the plan
 *   npx tsx scripts/verify-production-recovery.mts --hosts https://beyu.co.tz   # subset
 *
 * EXIT CODES
 *   0  no FAIL  (BLOCKED/NOT RUN do not fail the run — they are reported)
 *   2  at least one FAIL
 */

type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";

type Result = {
  check: string;
  status: Status;
  detail: string;
};

const EXPECTED_MIGRATION = "0075_noelia_authority_execution_hardening";

/** Canonical destinations. A hostname selects a presentation experience only —
 *  it never grants authority, so this table asserts ENTRY copy, not access. */
const DESTINATIONS: ReadonlyArray<{ origin: string; label: string; entryCopy: string }> = [
  { origin: "https://beyu.co.tz", label: "HOME (apex)", entryCopy: "control plane" },
  { origin: "https://www.beyu.co.tz", label: "HOME (www)", entryCopy: "control plane" },
  { origin: "https://health.beyu.co.tz", label: "HEALTH_OS", entryCopy: "Health OS" },
  { origin: "https://finance.beyu.co.tz", label: "FINANCE_OS", entryCopy: "Finance OS" },
  { origin: "https://agriculture.beyu.co.tz", label: "AGRICULTURE_OS", entryCopy: "Agriculture OS" },
  { origin: "https://ujenzi.beyu.co.tz", label: "UJENZI_OS", entryCopy: "Ujenzi OS" },
  { origin: "https://foundation.beyu.co.tz", label: "FOUNDATION (nonprofit sister organisation)", entryCopy: "Foundation" },
  { origin: "https://familyoffice.beyu.co.tz", label: "FAMILY_OFFICE (shared capability)", entryCopy: "Family Office" },
  { origin: "https://noelia.beyu.co.tz", label: "NOELIA_AI (governed assistant)", entryCopy: "Noelia" },
];

/** Protected-data markers. A sign-in page may legitimately MARKET a capability
 *  (Finance OS's public copy names CAP_POSTING), so only data-bearing strings
 *  are treated as evidence of disclosure. */
const PROTECTED_MARKERS = ["General Ledger", "Chart of Accounts", "journal entries", "DATA_NOT_AVAILABLE"];
const FAILURE_MARKERS = ["could not load this view", "42703", "global_scope does not exist"];

function arg(name: string, fallback: string | null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? (process.argv[i + 1] ?? fallback) : fallback;
}
const has = (flag: string) => process.argv.includes(`--${flag}`);

const BASE_URL = (arg("base-url", "https://beyu.co.tz") ?? "").replace(/\/+$/, "");
const HOSTS = (arg("hosts", null)?.split(",").map((h) => h.trim().replace(/\/+$/, "")) ?? null);
const EXPECTED_SHA = arg("expect-sha", null);

const results: Result[] = [];
const record = (check: string, status: Status, detail: string) => {
  results.push({ check, status, detail });
  const mark = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : status === "BLOCKED" ? "!" : "-";
  console.log(`  ${mark} [${status.padEnd(7)}] ${check.padEnd(46)} ${detail}`);
};

type FetchOutcome =
  | { kind: "response"; status: number; location: string | null; body: string; contentType: string | null }
  | { kind: "network-error"; message: string };

async function get(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text().catch(() => "");
    return {
      kind: "response",
      status: res.status,
      location: res.headers.get("location"),
      body,
      contentType: res.headers.get("content-type"),
    };
  } catch (error) {
    return { kind: "network-error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Scans a body for the failure signature and for protected-data markers. */
function scanBody(url: string, body: string): void {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const marker of FAILURE_MARKERS) {
    if (text.toLowerCase().includes(marker.toLowerCase())) {
      record(`failure signature on ${url}`, "FAIL", `body contains "${marker}" — the reported load failure is PRESENT`);
      return;
    }
  }
  const found = PROTECTED_MARKERS.filter((m) => text.includes(m));
  if (found.length > 0) {
    record(`protected data on ${url}`, "FAIL", `unauthenticated body contains protected markers: ${found.join(", ")}`);
  }
}

function jsonParse(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function checkHealth(): Promise<void> {
  const out = await get(`${BASE_URL}/api/health`);
  if (out.kind === "network-error") return record("liveness GET /api/health", "BLOCKED", `unreachable: ${out.message}`);
  const json = jsonParse(out.body);
  const dbUp = (json?.["checks"] as Record<string, unknown> | undefined)?.["database"];
  record(
    "liveness GET /api/health",
    out.status === 200 && json?.["ok"] === true && dbUp === "UP" ? "PASS" : "FAIL",
    `HTTP ${out.status} · ok=${String(json?.["ok"])} · database=${String(dbUp)}`,
  );
}

async function checkIdentity(): Promise<void> {
  const out = await get(`${BASE_URL}/api/health/identity`);
  if (out.kind === "network-error") return record("release identity /api/health/identity", "BLOCKED", `unreachable: ${out.message}`);
  const json = jsonParse(out.body);
  const identity = (json?.["identity"] ?? {}) as Record<string, unknown>;
  const sha = String(identity["gitSha"] ?? "");
  const detail =
    `HTTP ${out.status} · gitSha=${sha.slice(0, 12) || "-"} · env=${String(identity["environment"] ?? "-")} · ` +
    `build=${String(identity["buildId"] ?? "-")} · latestMigration(literal)=${String(identity["latestMigration"] ?? "-")}`;
  if (out.status !== 200) return record("release identity /api/health/identity", "FAIL", detail);
  if (EXPECTED_SHA && sha !== EXPECTED_SHA) {
    return record("release identity /api/health/identity", "FAIL", `${detail} — expected gitSha ${EXPECTED_SHA.slice(0, 12)}`);
  }
  // The reported migration here is a BUILD LITERAL, not the live database head.
  record("release identity /api/health/identity", "PASS", `${detail} (latestMigration is a build literal — never the live head)`);
}

async function checkSchema(): Promise<void> {
  const out = await get(`${BASE_URL}/api/health/schema`);
  if (out.kind === "network-error") return record("schema provenance /api/health/schema", "BLOCKED", `unreachable: ${out.message}`);
  if (out.status === 404) {
    return record(
      "schema provenance /api/health/schema",
      "BLOCKED",
      "HTTP 404 — the deployed build predates this endpoint (PR #106 not deployed). Live schema must be read via the governed preflight instead.",
    );
  }
  const json = jsonParse(out.body);
  const schema = (json?.["schema"] ?? {}) as Record<string, unknown>;
  const state = String(schema["state"] ?? "");
  const applied = String(schema["appliedMigration"] ?? "");
  const ok = out.status === 200 && state === "CURRENT" && applied === EXPECTED_MIGRATION;
  record(
    "schema provenance /api/health/schema",
    ok ? "PASS" : "FAIL",
    `HTTP ${out.status} · state=${state || "-"} · applied=${applied || "-"} (expected ${EXPECTED_MIGRATION})`,
  );
}

async function checkDestinations(hosts: ReadonlyArray<{ origin: string; label: string; entryCopy: string }>): Promise<void> {
  for (const host of hosts) {
    const out = await get(`${host.origin}/`);
    if (out.kind === "network-error") {
      record(`destination ${host.label}`, "BLOCKED", `unreachable: ${out.message}`);
      continue;
    }
    if (out.status >= 300 && out.status < 400) {
      record(`destination ${host.label}`, "PASS", `HTTP ${out.status} → ${out.location ?? "-"}`);
      continue;
    }
    scanBody(`${host.origin}/`, out.body);
    const holdsCopy = host.entryCopy.length === 0 || out.body.includes(host.entryCopy);
    record(
      `destination ${host.label}`,
      out.status === 200 && holdsCopy ? "PASS" : "FAIL",
      host.entryCopy.length === 0
        ? `HTTP ${out.status} · entry copy not asserted for a non-canonical origin`
        : `HTTP ${out.status} · entry copy "${host.entryCopy}" ${holdsCopy ? "present" : "ABSENT"}`,
    );
  }
}

async function checkDeepLinks(hosts: ReadonlyArray<{ origin: string; label: string }>): Promise<void> {
  const paths = ["/os", "/os/finance", "/os/health", "/os/foundation", "/os/noelia"];
  for (const host of hosts) {
    for (const path of paths) {
      const out = await get(`${host.origin}${path}`);
      if (out.kind === "network-error") {
        record(`anonymous deep link ${host.label}${path}`, "BLOCKED", `unreachable: ${out.message}`);
        continue;
      }
      if (out.status === 200) {
        scanBody(`${host.origin}${path}`, out.body);
        record(`anonymous deep link ${host.label}${path}`, "FAIL", "HTTP 200 to an anonymous request — expected a redirect or an explicit denial");
      } else if (out.status >= 300 && out.status < 400) {
        record(`anonymous deep link ${host.label}${path}`, "PASS", `HTTP ${out.status} → ${out.location ?? "-"}`);
      } else if (out.status >= 500) {
        record(`anonymous deep link ${host.label}${path}`, "FAIL", `HTTP ${out.status} — server error`);
      } else {
        scanBody(`${host.origin}${path}`, out.body);
        record(`anonymous deep link ${host.label}${path}`, "PASS", `HTTP ${out.status} (explicit denial)`);
      }
    }
  }
}

async function main(): Promise<void> {
  // `--hosts` selects canonical destinations when the origins match, and is
  // otherwise honoured verbatim (a non-canonical origin — a preview or a local
  // server — is checked without asserting canonical entry copy, so the flag can
  // never silently produce zero checks).
  const hosts = HOSTS
    ? HOSTS.map(
        (origin) =>
          DESTINATIONS.find((d) => d.origin === origin) ?? { origin, label: origin, entryCopy: "" },
      )
    : DESTINATIONS;

  console.log("BEYU OS — post-release recovery verification (READ ONLY, GETs only)");
  console.log(`  base URL : ${BASE_URL}`);
  console.log(`  hosts    : ${hosts.length === DESTINATIONS.length ? "all nine canonical hosts" : hosts.map((h) => h.origin).join(", ")}`);
  console.log(`  expected : ${EXPECTED_MIGRATION}${EXPECTED_SHA ? ` on gitSha ${EXPECTED_SHA.slice(0, 12)}` : ""}`);
  console.log("");

  if (has("list")) {
    console.log("PLAN (dry run — no request made):");
    for (const d of hosts) console.log(`  GET ${d.origin}/ and /os, /os/finance, /os/health, /os/foundation, /os/noelia`);
    console.log(`  GET ${BASE_URL}/api/health, /api/health/identity, /api/health/schema`);
    console.log("\nNOT RUN by this script (requires separate authorisation):");
    console.log("  * synthetic entitled sign-in and destination load (needs a synthetic account)");
    console.log("  * CAP_POSTING posting attempt (would be a mutation attempt)");
    console.log("  * tenant-isolation / RLS probes against the live database");
    return;
  }

  await checkHealth();
  await checkIdentity();
  await checkSchema();
  await checkDestinations(hosts);
  await checkDeepLinks(hosts);

  const failed = results.filter((r) => r.status === "FAIL");
  const blocked = results.filter((r) => r.status === "BLOCKED");
  console.log("");
  console.log(`summary: ${results.filter((r) => r.status === "PASS").length} PASS · ${failed.length} FAIL · ${blocked.length} BLOCKED`);
  if (blocked.length > 0) console.log("BLOCKED checks are NOT passes — resolve or record them before sign-off.");
  console.log("NOT RUN (needs separate authorisation): synthetic entitled sign-in; CAP_POSTING attempt; live RLS/tenant probes.");
  if (failed.length > 0) {
    console.log("");
    for (const f of failed) console.log(`  FAIL ${f.check}: ${f.detail}`);
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error("verification aborted:", error instanceof Error ? error.message : String(error));
  process.exit(2);
});
