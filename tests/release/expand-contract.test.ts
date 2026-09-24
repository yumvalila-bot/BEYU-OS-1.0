/**
 * BEYU OS — P3 Expand/Contract Tests (DB-free)
 */

import { describe, expect, it } from "vitest";
import {
  classifyMigration,
  createExpandContractGate,
  evaluateContractSafety,
  updateGateFromHistory,
} from "@/lib/release/expand-contract";
import type { ReleaseTransition } from "@/lib/release/types";

function makeHistory(states: string[], startTime: Date = new Date(Date.now() - 48 * 60 * 60 * 1000)): ReleaseTransition[] {
  return states.map((s, i) => ({
    id: `evt_${i}`,
    releaseId: "REL_test",
    sourceCommit: "abc123",
    artifactBuildId: "build_1",
    environment: "test",
    timestamp: new Date(startTime.getTime() + i * 1000).toISOString(),
    actorId: "USR_test",
    actorType: "HUMAN",
    previousState: i === 0 ? null : (states[i - 1] as never),
    nextState: s as never,
    reason: "test",
    verificationEvidence: null,
    correlationId: null,
    traceId: null,
  }));
}

describe("P3 expand/contract — classification", () => {
  it("CREATE TABLE is ADDITIVE", () => {
    expect(classifyMigration("CREATE TABLE foo (id text)")).toBe("ADDITIVE");
  });

  it("DROP TABLE is DESTRUCTIVE", () => {
    expect(classifyMigration("DROP TABLE foo")).toBe("DESTRUCTIVE");
  });

  it("DROP COLUMN is DESTRUCTIVE", () => {
    expect(classifyMigration("ALTER TABLE foo DROP COLUMN bar")).toBe("DESTRUCTIVE");
  });

  it("ADD COLUMN is ADDITIVE", () => {
    expect(classifyMigration("ALTER TABLE foo ADD COLUMN bar text")).toBe("ADDITIVE");
  });
});

describe("P3 expand/contract — gate", () => {
  it("creates gate for ADDITIVE", () => {
    const gate = createExpandContractGate({ releaseId: "REL_1", classification: "ADDITIVE" });
    expect(gate.classification).toBe("ADDITIVE");
    expect(gate.expandCompleted).toBe(false);
  });

  it("contract safety blocks without full lifecycle", () => {
    const gate = createExpandContractGate({ releaseId: "REL_1", classification: "CONTRACTING" });
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]);
    const result = evaluateContractSafety(gate, history);
    expect(result.allowed).toBe(false);
    expect(result.blocking.length).toBeGreaterThan(0);
  });

  it("contract safety allows with full lifecycle and elapsed window", () => {
    const gate = createExpandContractGate({
      releaseId: "REL_1",
      classification: "CONTRACTING",
      compatibilityWindowHours: 1, // Short window for test
    });
    // History from 48h ago, so window elapsed
    const history = makeHistory([
      "DESIGNED",
      "BUILT",
      "DEPLOYED",
      "PVG_VERIFIED",
      "PROMOTED",
      "SWITCHED",
      "RETIRED",
    ]);
    const result = evaluateContractSafety(gate, history, new Date());
    expect(result.allowed).toBe(true);
  });

  it("contract safety blocks if compatibility window not elapsed", () => {
    const gate = createExpandContractGate({
      releaseId: "REL_1",
      classification: "CONTRACTING",
      compatibilityWindowHours: 48,
    });
    // Promoted just now
    const now = new Date();
    const history = makeHistory(
      ["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED", "RETIRED"],
      now,
    );
    const result = evaluateContractSafety(gate, history, new Date(now.getTime() + 60 * 1000)); // 1 min later
    expect(result.allowed).toBe(false);
    expect(result.blocking.join(" ")).toContain("Compatibility window");
  });

  it("updateGateFromHistory marks completed steps", () => {
    const gate = createExpandContractGate({ releaseId: "REL_1", classification: "ADDITIVE" });
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "CANARY", "PROMOTED"]);
    const updated = updateGateFromHistory(gate, history);
    expect(updated.expandCompleted).toBe(true);
    expect(updated.migrateCompleted).toBe(true);
    expect(updated.verifyCompleted).toBe(true);
    expect(updated.canaryCompleted).toBe(true);
    expect(updated.promoteCompleted).toBe(true);
  });
});

describe("P3 expand/contract — P2 integration", () => {
  it("requires the exact 69-migration inventory and rejects the stale baseline", async () => {
    // 0063 adds the governed tenant-domain registry (tenant_domains): the ONE
    // hostname → tenant mapping, additive, RLS-protected and runtime read-only.
    // 0064 appends the CAPABILITY_BASE domain type; 0065 adds the Family Office
    // SHARED CAPABILITY base row (a governed namespace — never an OS, never a
    // tenant). 0066 adds the Shared Search capability: one regular tsvector
    // column + maintenance trigger + GIN index on ten already-RLS-protected
    // tables (native PostgreSQL FTS — no new index store, no new service).
    // 0067 adds the Holograph spatial capability registries (viz_assets,
    // viz_devices, viz_render_profiles, viz_interactions): additive,
    // expand-only, RLS-bound — the four governed presentation/interaction
    // registries of the existing shared capability (never a new OS).
    // 0068 grants the constrained runtime role the same DML privileges 0062
    // granted on the original visualization tables, extended to the four
    // Holograph registries (0067 created the tables but carried no grants;
    // the runtime role is the RLS-subject role and must hold the DML set for
    // the governed routes to function — RLS remains the boundary).
    // Historical SQL stays byte-exact.
    const { verifyP2MigrationIntegrity } = await import("@/lib/release/expand-contract");
    const result = verifyP2MigrationIntegrity(69);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(69);
    expect(verifyP2MigrationIntegrity(52).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(53).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(54).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(55).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(56).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(57).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(58).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(59).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(60).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(61).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(62).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(63).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(64).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(65).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(66).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(67).ok).toBe(false);
    expect(verifyP2MigrationIntegrity(68).ok).toBe(false);
  });

  it("EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT chain", () => {
    const chain = ["EXPAND", "MIGRATE", "VERIFY", "CANARY", "PROMOTE", "CONTRACT"];
    expect(chain).toEqual(["EXPAND", "MIGRATE", "VERIFY", "CANARY", "PROMOTE", "CONTRACT"]);
    // Verify gate enforces this order
    const gate = createExpandContractGate({ releaseId: "REL_1", classification: "CONTRACTING" });
    const incompleteHistory = makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED"]);
    const result = evaluateContractSafety(gate, incompleteHistory);
    expect(result.allowed).toBe(false);
    expect(result.blocking).toContain("SWITCHED required before CONTRACT");
  });
});
