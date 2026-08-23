/**
 * Phase 11 — isolated governed-execution simulation.
 *
 * POSITIVE: a complete synthetic fixture becomes SIMULATION_ELIGIBLE.
 * NEGATIVE: each 6C / epistemic / SoD / tenant failure denies independently.
 * FI: simulation vocabulary and mutatedProductionState are load-bearing.
 *
 * Production registries and financial tables are never written.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { permissionsForRoles, type Principal } from "@/lib/authz";
import { node } from "@/lib/finance/lineage";
import {
  EXECUTION_SIM_VERSION,
  assertSimulationVocabulary,
  simulateGovernedExecution,
  syntheticAuthority,
  type SimulationInput,
} from "@/lib/execution/simulate";

const TRACE = "SIM-TRACE-0001";
const ASOF = "2026-02-15";

function principal(over: Partial<Principal> = {}): Principal {
  const roles = over.roles ?? ["GROUP_CFO"];
  return {
    userId: "USR_SYNTH_001",
    partyId: "PTY_SYNTH",
    email: "synth@example.test",
    displayName: "Synthetic Principal",
    tenantId: "TEN_SYNTH",
    tenantCode: "SYNTH",
    tenantType: "ENTERPRISE",
    roles,
    permissions: permissionsForRoles(roles),
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_SYNTH",
    riskScore: 0,
    emergencyPermissions: [],
    ...over,
  };
}

function valid(over: Partial<SimulationInput> = {}): SimulationInput {
  return {
    traceId: TRACE,
    principal: principal(),
    tenantId: "TEN_SYNTH",
    legalEntityId: "LEN_SYNTH",
    capabilityCode: "CAP_POSTING",
    permission: "finance:ledger.post",
    authority: syntheticAuthority({ tenantId: "TEN_SYNTH" }),
    requiredPermission: "finance:ledger.post",
    asOf: ASOF,
    capabilityDeclared: true,
    sourceClass: "OBSERVED",
    targetClass: "POSTED",
    writerModule: "finance/posting-engine",
    writesTable: "journal_entries + journal_lines",
    requiresChecker: true,
    makerUserId: "USR_SYNTH_001",
    checkerUserId: "USR_SYNTH_002",
    workflow: { from: "DRAFT", to: "REVIEW", role: "MAKER" },
    lineageNodes: [
      node("LEDGER", "journal_lines", "POSTED", "read", {
        sourceId: "SYNTH-J1",
        tenantId: "TEN_SYNTH",
        legalEntityId: "LEN_SYNTH",
        traceId: TRACE,
      }),
    ],
    policyRef: "SYNTH-POL-1",
    ...over,
  };
}

async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  const r = (await db.execute(q)) as unknown as { rows: Array<{ n: number }> };
  return Number(r.rows[0].n);
}

describe("simulation vocabulary", () => {
  it("versions are pinned", () => {
    expect(EXECUTION_SIM_VERSION).toBe("execution-sim-1.0.0");
  });

  it("FI: production activation words MUST throw", () => {
    expect(() => assertSimulationVocabulary("RATIFIED")).toThrow(/production activation word/);
    expect(() => assertSimulationVocabulary("APPROVED")).toThrow(/production activation word/);
    expect(() => assertSimulationVocabulary("EFFECTIVE")).toThrow(/production activation word/);
    expect(() => assertSimulationVocabulary("ACTIVATED")).toThrow(/production activation word/);
  });

  it("FI: only the two simulation verdicts are accepted", () => {
    expect(() => assertSimulationVocabulary("SIMULATION_ELIGIBLE")).not.toThrow();
    expect(() => assertSimulationVocabulary("SIMULATION_DENIED")).not.toThrow();
    expect(() => assertSimulationVocabulary("PERMITTED")).toThrow(/Unknown simulation verdict/);
  });
});

describe("POSITIVE: a complete isolated fixture is SIMULATION_ELIGIBLE", () => {
  it("composes every stage and would execute without writing", async () => {
    const before = {
      je: await count(sql`select count(*)::int as n from journal_entries`),
      dpend: await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`),
      clock: await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`),
      aud: await count(sql`select count(*)::int as n from audit_log`),
    };

    const r = simulateGovernedExecution(valid());
    expect(r.classification).toBe("SIMULATION");
    expect(r.verdict).toBe("SIMULATION_ELIGIBLE");
    expect(r.wouldExecute).toBe(true);
    expect(r.mutatedProductionState).toBe(false);
    expect(r.authority.exists).toBe(true);
    expect(r.authority.effective).toBe(true);
    expect(r.authority.permits).toBe(true);
    expect(r.correlation.classification).toBe("SIMULATION");
    expect(r.correlation.traceId).toBe(TRACE);
    expect(r.correlation.actor).toBe("USR_SYNTH_001");
    expect(r.lineage?.canonical).toBe(false);
    expect(r.explanation.join(" ")).toMatch(/not ACTIVATED/i);
    expect(r.stages.every((s) => s.passed)).toBe(true);

    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(before.je);
    expect(
      await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`),
    ).toBe(before.dpend);
    expect(
      await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`),
    ).toBe(before.clock);
    expect(await count(sql`select count(*)::int as n from audit_log`)).toBe(before.aud);
  });
});

describe("NEGATIVE: each load-bearing stage denies independently", () => {
  it("missing principal", () => {
    const r = simulateGovernedExecution(valid({ principal: null }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "PRINCIPAL")?.passed).toBe(false);
  });

  it("wrong tenant", () => {
    const r = simulateGovernedExecution(valid({ tenantId: "TEN_OTHER" }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "TENANT")?.passed).toBe(false);
  });

  it("wrong entity scope", () => {
    const r = simulateGovernedExecution(
      valid({ principal: principal({ entityScope: ["LEN_OTHER"] }) }),
    );
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "ENTITY")?.passed).toBe(false);
  });

  it("wrong permission — auditor cannot post", () => {
    const r = simulateGovernedExecution(valid({ principal: principal({ roles: ["AUDITOR"] }) }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "PERMISSION")?.passed).toBe(false);
  });

  it("missing authority", () => {
    const r = simulateGovernedExecution(valid({ authority: null }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.authority.exists).toBe(false);
    expect(r.stages.find((s) => s.stage === "AUTHORITY_EXISTS")?.passed).toBe(false);
  });

  it("future authority does not act early", () => {
    const r = simulateGovernedExecution(
      valid({ authority: syntheticAuthority({ tenantId: "TEN_SYNTH", effectiveFrom: "2026-06-01" }) }),
    );
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.authority.effective).toBe(false);
  });

  it("expired / revoked authority", () => {
    expect(
      simulateGovernedExecution(
        valid({ authority: syntheticAuthority({ tenantId: "TEN_SYNTH", status: "EXPIRED" }) }),
      ).verdict,
    ).toBe("SIMULATION_DENIED");
    expect(
      simulateGovernedExecution(
        valid({ authority: syntheticAuthority({ tenantId: "TEN_SYNTH", status: "REVOKED" }) }),
      ).verdict,
    ).toBe("SIMULATION_DENIED");
  });

  it("undeclared capability is AUTHORITY_CHAIN_INCOMPLETE", () => {
    const r = simulateGovernedExecution(valid({ capabilityDeclared: false }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "CAPABILITY")?.detail).toMatch(/INCOMPLETE/);
  });

  it("forecast cannot become posted", () => {
    const r = simulateGovernedExecution(valid({ sourceClass: "FORECAST", targetClass: "POSTED" }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "EPISTEMIC")?.passed).toBe(false);
  });

  it("assumption / scenario / synthetic cannot become posted", () => {
    expect(simulateGovernedExecution(valid({ sourceClass: "ASSUMPTION", targetClass: "POSTED" })).verdict).toBe(
      "SIMULATION_DENIED",
    );
    expect(simulateGovernedExecution(valid({ sourceClass: "SCENARIO", targetClass: "POSTED" })).verdict).toBe(
      "SIMULATION_DENIED",
    );
    expect(simulateGovernedExecution(valid({ sourceClass: "SYNTHETIC", targetClass: "OBSERVED" })).verdict).toBe(
      "SIMULATION_DENIED",
    );
  });

  it("non-canonical writer", () => {
    const r = simulateGovernedExecution(valid({ writerModule: "specialist/forecast" }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "CANONICAL_WRITER")?.passed).toBe(false);
  });

  it("self-approval", () => {
    const r = simulateGovernedExecution(valid({ checkerUserId: "USR_SYNTH_001" }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "SEGREGATION")?.passed).toBe(false);
  });

  it("malformed trace", () => {
    const r = simulateGovernedExecution(valid({ traceId: "x" }));
    expect(r.verdict).toBe("SIMULATION_DENIED");
    expect(r.stages.find((s) => s.stage === "CORRELATION")?.passed).toBe(false);
  });
});

describe("FI: mutatedProductionState is structural", () => {
  it("cannot be true on any path", () => {
    for (const input of [
      valid(),
      valid({ principal: null }),
      valid({ sourceClass: "FORECAST", targetClass: "POSTED" }),
      valid({ authority: null }),
    ]) {
      const r = simulateGovernedExecution(input);
      expect(r.mutatedProductionState).toBe(false);
      expect(r.classification).toBe("SIMULATION");
      expect(["SIMULATION_ELIGIBLE", "SIMULATION_DENIED"]).toContain(r.verdict);
    }
  });
});
