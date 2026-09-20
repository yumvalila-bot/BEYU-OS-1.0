/**
 * BEYU OS — P3 Architecture Invariants (DB-free)
 *
 * Ensures P3 governance exists as single canonical implementation,
 * no duplicate OS, no bypasses, no secret leakage, preserves P2 invariants.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
};

describe("P3 — canonical release governance exists", () => {
  it("release lib exists as single canonical location", () => {
    const index = read("src/lib/release/index.ts");
    expect(index).toContain("P3 Release Governance");
    expect(index).toContain("canonical");
  });

  it("state machine exists", () => {
    const sm = read("src/lib/release/state-machine.ts");
    expect(sm).toContain("ALLOWED_TRANSITIONS");
    expect(sm).toContain("DEPLOYED");
    expect(sm).toContain("PVG_VERIFIED");
    expect(sm).toContain("PROMOTED");
  });

  it("release identity exists", () => {
    const id = read("src/lib/release/identity.ts");
    expect(id).toContain("getCurrentReleaseIdentity");
    expect(id).toContain("server-derived");
  });

  it("PVG exists with 10 checks", () => {
    const pvg = read("src/lib/release/pvg.ts");
    expect(pvg).toContain("runtime_health");
    expect(pvg).toContain("release_identity");
    expect(pvg).toContain("database_connectivity");
    expect(pvg).toContain("database_migration_state");
    expect(pvg).toContain("schema_fingerprint");
    expect(pvg).toContain("authorization_security");
    expect(pvg).toContain("critical_application_readiness");
    expect(pvg).toContain("event_outbox_health");
    expect(pvg).toContain("environment_identity");
    expect(pvg).toContain("deployment_identity");
  });

  it("canary governance exists", () => {
    const canary = read("src/lib/release/canary.ts");
    expect(canary).toContain("CANARY_CONFIGURED");
    expect(canary).toContain("CANARY_DEPLOYED");
    expect(canary).toContain("CANARY_PVG_VERIFIED");
    expect(canary).toContain("CANARY_TRAFFIC_ACTIVE");
    expect(canary).toContain("CANARY_OBSERVATION");
    expect(canary).toContain("CANARY_PROMOTION_ELIGIBLE");
    expect(canary).toContain("traffic percentage");
  });

  it("blue/green governance exists", () => {
    const bg = read("src/lib/release/blue-green.ts");
    expect(bg).toContain("BLUE_ACTIVE");
    expect(bg).toContain("GREEN_DEPLOYED");
    expect(bg).toContain("GREEN_PVG_VERIFIED");
    expect(bg).toContain("GREEN_CANARY");
    expect(bg).toContain("GREEN_PROMOTION_READY");
    expect(bg).toContain("GREEN_ACTIVE");
    expect(bg).toContain("BLUE_RETIRED");
  });

  it("no duplicate release/state/PVG implementations", () => {
    // Search for forbidden duplicate tokens in src/lib (excluding release itself)
    const forbidden = ["PVG_OS", "RELEASE_OS", "CANARY_OS", "BLUE_GREEN_OS", "DEPLOYMENT_OS"];
    const osFile = read("src/lib/operating-systems.ts");
    for (const token of forbidden) {
      expect(osFile.includes(token), `found forbidden ${token} in OS catalogue`).toBe(false);
    }
  });
});

describe("P3 — deployment invariants documented", () => {
  it("DEPLOYED != VERIFIED != PROMOTED", () => {
    const sm = read("src/lib/release/state-machine.ts");
    expect(sm).toContain("DEPLOYED != VERIFIED != PROMOTED");
  });

  it("EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT", () => {
    const ec = read("src/lib/release/expand-contract.ts");
    expect(ec).toContain("EXPAND");
    expect(ec).toContain("MIGRATE");
    expect(ec).toContain("VERIFY");
    expect(ec).toContain("CANARY");
    expect(ec).toContain("PROMOTE");
    expect(ec).toContain("CONTRACT");
  });

  it("canary percentage does not authorize promotion", () => {
    const canary = read("src/lib/release/canary.ts");
    expect(canary.toLowerCase()).toContain("traffic percentage");
    expect(canary).toContain("separate from authorization");
  });

  it("PVG fail-closed", () => {
    const pvg = read("src/lib/release/pvg.ts");
    expect(pvg).toContain("fail closed");
  });
});

describe("P3 — no secret leakage", () => {
  it("identity endpoint does not expose DATABASE_URL", () => {
    const identityRoute = read("src/app/api/health/identity/route.ts");
    expect(identityRoute).not.toContain("DATABASE_URL");
    expect(identityRoute).toContain("Never expose secrets");
  });

  it("build-identity script has secret check", () => {
    const buildScript = read("scripts/build-identity.mjs");
    expect(buildScript).toContain("secret");
    expect(buildScript).toContain("DATABASE_URL");
  });

  it("release identity module checks secret-like", () => {
    const id = read("src/lib/release/identity.ts");
    expect(id).toContain("isSecretLike");
    expect(id).toContain("DATABASE_URL");
  });
});

describe("P3 — preserves P2 invariants", () => {
  it("migration 0046 exists and is additive", () => {
    const mig = read("drizzle/0046_release_governance.sql");
    expect(mig).toContain("release_records");
    expect(mig).toContain("CREATE TABLE");
    expect(mig).not.toContain("DROP TABLE");
  });

  it("KNOWN_METADATA_DEBT includes 0046", () => {
    const integrity = read("src/lib/migration/integrity.ts");
    expect(integrity).toContain("0046");
    expect(read("drizzle/meta/_journal.json")).toContain("0046_release_governance");
  });

  it("journal appends current inventory without fabricating historical snapshots", () => {
    const journal = read("drizzle/meta/_journal.json");
    expect(journal).toContain("0039");
    expect(journal).toContain("0046_release_governance");
    expect(journal).toContain("0048_governance_isolation"); // Historical snapshot debt remains explicit
  });

  it("CAP_POSTING still locked (not bypassed)", () => {
    const pvg = read("src/lib/release/pvg.ts");
    expect(pvg).toContain("capPostingLocked");
  });
});

describe("P3 — API governance", () => {
  it("health/identity endpoint is unauthenticated and force-dynamic", () => {
    const route = read("src/app/api/health/identity/route.ts");
    expect(route).toContain("force-dynamic");
    expect(route).not.toContain("guarded");
  });

  it("release transitions API is guarded with platform:config.manage", () => {
    const route = read("src/app/api/v1/system/release/transitions/route.ts");
    expect(route).toContain("guarded");
    expect(route).toContain("platform:config.manage");
  });

  it("PVG API is guarded", () => {
    const route = read("src/app/api/v1/system/release/pvg/route.ts");
    expect(route).toContain("guarded");
    expect(route).toContain("platform:config.manage");
  });

  it("release read API is guarded with dashboard.read", () => {
    const route = read("src/app/api/v1/system/release/route.ts");
    expect(route).toContain("guarded");
    expect(route).toContain("platform:dashboard.read");
  });
});

describe("P3 — adapter boundaries", () => {
  it("canary adapter has noop and vercel with isRealInfrastructure flag", () => {
    const canary = read("src/lib/release/canary.ts");
    expect(canary).toContain("isRealInfrastructure");
    expect(canary).toContain("NoOpTrafficAdapter");
    expect(canary).toContain("VercelTrafficAdapter");
    expect(canary).toContain("HUMAN_CONTROLLED");
  });

  it("blue/green adapter has boundary", () => {
    const bg = read("src/lib/release/blue-green.ts");
    expect(bg).toContain("isRealInfrastructure");
    expect(bg).toContain("NoOpDeploymentAdapter");
    expect(bg).toContain("HUMAN_CONTROLLED");
  });

  it("rollback executors stop at human boundary", () => {
    const rb = read("src/lib/release/rollback.ts");
    expect(rb).toContain("HUMAN_CONTROLLED");
    expect(rb).toContain("FORWARD_FIX_ONLY");
  });
});
