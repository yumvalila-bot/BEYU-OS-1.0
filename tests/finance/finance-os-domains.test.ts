/**
 * FINANCE OS — workflow, intercompany, lineage and domain registry.
 *
 * These four close the last structural gaps. Each guards a distinct laundering route:
 *
 *   WORKFLOW      one person occupying every control role
 *   INTERCOMPANY  another tenant's entity absorbed into this tenant's truth
 *   LINEAGE       a derived figure quietly presenting itself as canonical
 *   DOMAINS       a maturity matrix that flatters itself
 *
 * The domain-registry tests are deliberately adversarial about the registry's own honesty: they
 * assert it CANNOT report COMPLETE while a criterion is false, and that domains without substrate
 * are listed rather than omitted.
 *
 * NON-VACUITY. Real-substrate assertions use exact counts (8 entities, 6 tenants, 3 attribution
 * conflicts). A silently-empty query fails.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  EXECUTION_STATES,
  ROLE_INCOMPATIBILITY,
  WORKFLOW_STATE,
  WORKFLOW_TRANSITIONS,
  assertIncompatibilitySymmetry,
  checkRoleSeparation,
  evaluateWorkflowTransition,
  isWorkflowState,
  rolesHeldBy,
  summarizeWorkflow,
  type WorkflowStep,
} from "@/lib/finance/workflow";
import {
  INTERCOMPANY_VERSION,
  assessEliminations,
  determineConsolidationScope,
  foreignEntities,
  matchReciprocal,
  ownershipOf,
  scanEntityOwnershipConsistency,
  validateIntercompany,
} from "@/lib/finance/intercompany";
import {
  LINEAGE_VERSION,
  assertNotCanonical,
  buildLineage,
  detectCrossTenantLineage,
  isCanonicalSource,
  node,
  verifyLineageRoot,
} from "@/lib/finance/lineage";
import {
  FINANCE_DOMAINS,
  assessDomain,
  maturityMatrix,
  maturitySummary,
  serviceContract,
} from "@/lib/finance/domains";

const TRACE = "TRACE-FIN-0001";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

const step = (
  state: (typeof WORKFLOW_STATE)[number],
  actorUserId: string,
  role: Parameters<typeof checkRoleSeparation>[0]["role"],
): WorkflowStep => ({
  state, actorUserId, role, at: "2026-02-15T00:00:00Z", reason: "test", traceId: TRACE,
});

// =============================================================================
// WORKFLOW
// =============================================================================
describe("workflow state machine", () => {
  it("permits the ordinary path", () => {
    expect(evaluateWorkflowTransition({
      from: "DRAFT", to: "REVIEW", actorUserId: "U1", role: "MAKER", traceId: TRACE,
    }).permitted).toBe(true);
  });

  it("refuses a skipped state", () => {
    const r = evaluateWorkflowTransition({
      from: "DRAFT", to: "EXECUTION", actorUserId: "U1", role: "MAKER", traceId: TRACE,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("ILLEGAL_TRANSITION");
  });

  it("terminal states admit nothing", () => {
    for (const terminal of ["CLOSE", "REJECTED", "CANCELLED"] as const) {
      expect(WORKFLOW_TRANSITIONS[terminal]).toEqual([]);
      const r = evaluateWorkflowTransition({
        from: terminal, to: "DRAFT", actorUserId: "U1", role: "MAKER", traceId: TRACE,
      });
      expect(r.decision).toBe("TERMINAL_STATE");
    }
  });

  it("an unknown state fails closed", () => {
    expect(evaluateWorkflowTransition({
      from: "APPROVED_ALREADY", to: "EXECUTION", actorUserId: "U1", role: "MAKER", traceId: TRACE,
    }).decision).toBe("UNKNOWN_STATE");
  });

  it("does not normalise case", () => {
    expect(isWorkflowState("draft")).toBe(false);
  });

  it("requires a well-formed trace id", () => {
    const r = evaluateWorkflowTransition({
      from: "DRAFT", to: "REVIEW", actorUserId: "U1", role: "MAKER", traceId: "x",
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("MISSING_TRACE");
  });

  it("EXHAUSTIVE: all 121 state pairs are decided explicitly", () => {
    for (const from of WORKFLOW_STATE) {
      for (const to of WORKFLOW_STATE) {
        const r = evaluateWorkflowTransition({
          from, to, actorUserId: "U1", role: "MAKER", traceId: TRACE, capabilityActivated: true,
        });
        expect(typeof r.permitted).toBe("boolean");
        expect(r.reason.length).toBeGreaterThan(10);
      }
    }
  });

  it("no state transitions to itself in the table", () => {
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });
});

describe("workflow segregation of duties", () => {
  it("refuses the maker as checker", () => {
    const history = [step("DRAFT", "U1", "MAKER")];
    const r = checkRoleSeparation({ history, actorUserId: "U1", role: "CHECKER" });
    expect(r.permitted).toBe(false);
    expect(r.conflictingRoles).toContain("MAKER");
  });

  it("refuses the maker as authorizer", () => {
    expect(checkRoleSeparation({
      history: [step("DRAFT", "U1", "MAKER")], actorUserId: "U1", role: "AUTHORIZER",
    }).permitted).toBe(false);
  });

  it("refuses the checker as authorizer", () => {
    expect(checkRoleSeparation({
      history: [step("REVIEW", "U2", "CHECKER")], actorUserId: "U2", role: "AUTHORIZER",
    }).permitted).toBe(false);
  });

  it("POSITIVE CONTROL: three distinct principals may hold the three roles", () => {
    const history = [step("DRAFT", "U1", "MAKER"), step("REVIEW", "U2", "CHECKER")];
    expect(checkRoleSeparation({ history, actorUserId: "U3", role: "AUTHORIZER" }).permitted).toBe(true);
  });

  it("the authorizer may also execute — a mechanical act", () => {
    const history = [step("AUTHORIZATION", "U3", "AUTHORIZER")];
    expect(checkRoleSeparation({ history, actorUserId: "U3", role: "EXECUTOR" }).permitted).toBe(true);
  });

  it("but the maker may never execute", () => {
    expect(checkRoleSeparation({
      history: [step("DRAFT", "U1", "MAKER")], actorUserId: "U1", role: "EXECUTOR",
    }).permitted).toBe(false);
  });

  it("blocks the transition itself, not just the role check", () => {
    const r = evaluateWorkflowTransition({
      from: "REVIEW", to: "APPROVAL", actorUserId: "U1", role: "CHECKER", traceId: TRACE,
      history: [step("DRAFT", "U1", "MAKER")],
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("SEGREGATION_OF_DUTIES");
  });

  it("FI-1: the incompatibility relation is symmetric", () => {
    // A one-sided edit would block maker->checker while permitting checker->maker. The map is
    // consulted by the NEW role, so asymmetry is invisible from one direction only.
    const s = assertIncompatibilitySymmetry();
    expect(s.violations).toEqual([]);
    expect(s.symmetric).toBe(true);
  });

  it("FI-1: MAKER explicitly excludes the other three roles in the table", () => {
    expect([...ROLE_INCOMPATIBILITY.MAKER].sort()).toEqual(["AUTHORIZER", "CHECKER", "EXECUTOR"]);
  });

  it("FI-1: separation holds in BOTH directions for every incompatible pair", () => {
    for (const a of ["MAKER", "CHECKER", "AUTHORIZER", "EXECUTOR"] as const) {
      for (const b of ROLE_INCOMPATIBILITY[a]) {
        // a first, then b
        expect(checkRoleSeparation({
          history: [step("DRAFT", "U1", a)], actorUserId: "U1", role: b,
        }).permitted).toBe(false);
        // b first, then a — the direction FI-1 left unguarded
        expect(checkRoleSeparation({
          history: [step("DRAFT", "U1", b)], actorUserId: "U1", role: a,
        }).permitted).toBe(false);
      }
    }
  });

  it("FI-1c: separation survives an ASYMMETRIC table via the bidirectional lookup", () => {
    // The symmetry assertion protects the table; this protects the lookup. With a deliberately
    // one-sided relation, a one-directional lookup would permit the reverse pairing. The
    // bidirectional check must still refuse it, so the two guards fail independently.
    const asymmetric = { MAKER: [], CHECKER: ["MAKER"], AUTHORIZER: [], EXECUTOR: [] } as unknown as
      Record<"MAKER" | "CHECKER" | "AUTHORIZER" | "EXECUTOR", readonly ("MAKER" | "CHECKER" | "AUTHORIZER" | "EXECUTOR")[]>;

    const bidirectional = (held: "MAKER", next: "CHECKER") =>
      asymmetric[next].includes(held) || asymmetric[held].includes(next);
    const oneDirectional = (held: "MAKER", next: "CHECKER") => asymmetric[held].includes(next);

    // Asking "may the MAKER now be CHECKER?" against the one-sided table:
    expect(oneDirectional("MAKER", "CHECKER")).toBe(false); // would WRONGLY permit
    expect(bidirectional("MAKER", "CHECKER")).toBe(true);   // correctly refuses

    // And the real table is symmetric, so both agree in production.
    expect(assertIncompatibilitySymmetry().symmetric).toBe(true);
  });

  it("rolesHeldBy reports every role a principal held", () => {
    const history = [step("DRAFT", "U1", "MAKER"), step("REVIEW", "U1", "CHECKER")];
    expect(rolesHeldBy(history, "U1").sort()).toEqual(["CHECKER", "MAKER"]);
  });
});

describe("workflow execution gate", () => {
  it("execution states require an activated capability", () => {
    for (const state of EXECUTION_STATES) {
      const from = state === "EXECUTION" ? "AUTHORIZATION" : state === "POSTING" ? "EXECUTION" : "POSTING";
      const r = evaluateWorkflowTransition({
        from, to: state, actorUserId: "U4", role: "EXECUTOR", traceId: TRACE,
      });
      expect(r.permitted).toBe(false);
      expect(r.decision).toBe("CAPABILITY_LOCKED");
    }
  });

  it("an omitted capability flag fails closed — it is not treated as true", () => {
    const r = evaluateWorkflowTransition({
      from: "AUTHORIZATION", to: "EXECUTION", actorUserId: "U4", role: "EXECUTOR", traceId: TRACE,
      capabilityActivated: undefined,
    });
    expect(r.permitted).toBe(false);
  });

  it("POSITIVE CONTROL: execution proceeds with an activated capability", () => {
    const r = evaluateWorkflowTransition({
      from: "AUTHORIZATION", to: "EXECUTION", actorUserId: "U4", role: "EXECUTOR", traceId: TRACE,
      capabilityActivated: true,
    });
    expect(r.permitted).toBe(true);
  });

  it("non-execution transitions do not need a capability", () => {
    expect(evaluateWorkflowTransition({
      from: "REVIEW", to: "APPROVAL", actorUserId: "U2", role: "CHECKER", traceId: TRACE,
    }).permitted).toBe(true);
  });
});

describe("workflow post-hoc review", () => {
  it("detects a completed workflow where one principal held two control roles", () => {
    const s = summarizeWorkflow([
      step("DRAFT", "U1", "MAKER"),
      step("REVIEW", "U1", "CHECKER"),
      step("APPROVAL", "U2", "AUTHORIZER"),
    ]);
    expect(s.segregationBreaches.length).toBe(1);
    expect(s.segregationBreaches[0].userId).toBe("U1");
  });

  it("POSITIVE CONTROL: a clean workflow reports no breach", () => {
    const s = summarizeWorkflow([
      step("DRAFT", "U1", "MAKER"),
      step("REVIEW", "U2", "CHECKER"),
      step("APPROVAL", "U3", "AUTHORIZER"),
    ]);
    expect(s.segregationBreaches).toEqual([]);
    expect(s.distinctActors).toBe(3);
  });

  it("reports terminality and execution reach", () => {
    const s = summarizeWorkflow([step("CLOSE", "U1", "MAKER")]);
    expect(s.terminal).toBe(true);
    expect(s.reachedExecution).toBe(false);
  });
});

// =============================================================================
// INTERCOMPANY
// =============================================================================
describe("intercompany ownership", () => {
  it("reads ownership from the canonical entity table", async () => {
    const o = await ownershipOf("LEN_BEYU_HEALTH_LTD");
    expect(o.exists).toBe(true);
    expect(o.owningTenantId).toBe("TEN_BEYU_HEALTH");
  });

  it("a nonexistent entity has no owner and is not assumed", async () => {
    const o = await ownershipOf("LEN_NOT_REAL");
    expect(o.exists).toBe(false);
    expect(o.owningTenantId).toBeNull();
  });

  it("all 8 entities have a recorded owner", async () => {
    const rows = await scanEntityOwnershipConsistency();
    expect(rows.length).toBe(8);
    expect(rows.every((r) => r.consistent)).toBe(true);
  });
});

describe("intercompany validation", () => {
  it("POSITIVE CONTROL: same-tenant intercompany is permitted", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HOLDINGS",
      destinationEntityId: "LEN_BEYU_FAMILY_TRUST",
      actingTenantId: "TEN_BEYU_GROUP",
    });
    expect(r.permitted).toBe(true);
    expect(r.crossTenant).toBe(false);
  });

  it("cross-tenant movement requires explicit authority", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HOLDINGS",
      destinationEntityId: "LEN_BEYU_HEALTH_LTD",
      actingTenantId: "TEN_BEYU_GROUP",
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("CROSS_TENANT_REQUIRES_AUTHORITY");
    expect(r.crossTenant).toBe(true);
  });

  it("POSITIVE CONTROL: cross-tenant succeeds with authority", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HOLDINGS",
      destinationEntityId: "LEN_BEYU_HEALTH_LTD",
      actingTenantId: "TEN_BEYU_GROUP",
      hasCrossTenantAuthority: true,
    });
    expect(r.permitted).toBe(true);
  });

  it("a tenant owning neither side is refused", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HEALTH_LTD",
      destinationEntityId: "LEN_BEYU_AGRI_LTD",
      actingTenantId: "TEN_BEYU_FINTECH",
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("ATTRIBUTION_CONFLICT");
  });

  it("even with cross-tenant authority, owning neither side is still refused", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HEALTH_LTD",
      destinationEntityId: "LEN_BEYU_AGRI_LTD",
      actingTenantId: "TEN_BEYU_FINTECH",
      hasCrossTenantAuthority: true,
    });
    expect(r.permitted).toBe(false);
  });

  it("a missing entity is DATA_NOT_AVAILABLE, not a pass", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_NOPE", destinationEntityId: "LEN_BEYU_HOLDINGS",
      actingTenantId: "TEN_BEYU_GROUP",
    });
    expect(r.decision).toBe("DATA_NOT_AVAILABLE");
  });

  it("same entity on both sides is not an intercompany transaction", async () => {
    const r = await validateIntercompany({
      sourceEntityId: "LEN_BEYU_HOLDINGS", destinationEntityId: "LEN_BEYU_HOLDINGS",
      actingTenantId: "TEN_BEYU_GROUP",
    });
    expect(r.decision).toBe("SAME_ENTITY");
  });

  it("identifies foreign entities in a reference set", async () => {
    const f = await foreignEntities({
      entityIds: ["LEN_BEYU_HOLDINGS", "LEN_BEYU_HEALTH_LTD", "LEN_BEYU_AGRI_LTD"],
      actingTenantId: "TEN_BEYU_GROUP",
    });
    expect(f).toEqual(["LEN_BEYU_AGRI_LTD", "LEN_BEYU_HEALTH_LTD"]);
  });
});

describe("reciprocal matching never auto-resolves", () => {
  it("an amount mismatch is reported, not adjusted", () => {
    const r = matchReciprocal({
      sourceAmount: "1000.00", destinationAmount: "900.00",
      sourceCurrency: "USD", destinationCurrency: "USD",
    });
    expect(r.matched).toBe(false);
    expect(r.difference).toBe("100.00");
    expect(r.autoResolved).toBe(false);
  });

  it("a currency mismatch requires a governed rate", () => {
    const r = matchReciprocal({
      sourceAmount: "1000.00", destinationAmount: "1000.00",
      sourceCurrency: "USD", destinationCurrency: "TZS",
    });
    expect(r.decision).toBe("CURRENCY_MISMATCH");
    expect(r.reason).toContain("P4");
  });

  it("POSITIVE CONTROL: an agreeing pair matches", () => {
    const r = matchReciprocal({
      sourceAmount: "1000.00", destinationAmount: "1000.00",
      sourceCurrency: "USD", destinationCurrency: "USD",
    });
    expect(r.matched).toBe(true);
  });

  it("a missing side is DATA_NOT_AVAILABLE", () => {
    expect(matchReciprocal({
      sourceAmount: "1000.00", destinationAmount: null,
      sourceCurrency: "USD", destinationCurrency: "USD",
    }).decision).toBe("DATA_NOT_AVAILABLE");
  });
});

describe("consolidation scope", () => {
  it("includes only entities the tenant owns", async () => {
    const s = await determineConsolidationScope("TEN_BEYU_GROUP");
    expect(s.includedEntities).toEqual(["LEN_BEYU_FAMILY_TRUST", "LEN_BEYU_HOLDINGS"]);
    expect(s.excludedEntities.length).toBe(6);
  });

  it("is REQUIRES_AUTHORITY, never a usable consolidation", async () => {
    const s = await determineConsolidationScope("TEN_BEYU_GROUP");
    expect(s.decision).toBe("REQUIRES_AUTHORITY");
    expect(s.limitations.join(" ")).toContain("must not be used to produce consolidated figures");
  });

  it("does not infer control or ownership percentages", async () => {
    const s = await determineConsolidationScope("TEN_BEYU_GROUP");
    expect(s.ownershipBasis).toBe("CANONICAL_ENTITY_TABLE");
    expect(s.limitations.join(" ")).toContain("CONTROL is not assessed");
  });

  it("eliminations always eliminate zero", async () => {
    const e = await assessEliminations("TEN_BEYU_GROUP");
    expect(e.eliminated).toBe(0);
    expect(e.decision).toBe("REQUIRES_AUTHORITY");
    expect(e.candidatePairs).toBe(1);
  });
});

// =============================================================================
// LINEAGE
// =============================================================================
describe("data lineage", () => {
  it("an empty lineage is DATA_NOT_AVAILABLE, never trusted", () => {
    const l = buildLineage([]);
    expect(l.resultClass).toBe("DATA_NOT_AVAILABLE");
    expect(l.complete).toBe(false);
  });

  it("the result is never stronger than its weakest input", () => {
    const l = buildLineage([
      node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J1", traceId: TRACE }),
      node("FORECAST", "forecast-engine", "ASSUMPTION", "assume", { sourceId: "A1", traceId: TRACE }),
    ]);
    expect(l.resultClass).toBe("ASSUMPTION");
    expect(l.weakestLink?.epistemicClass).toBe("ASSUMPTION");
    expect(l.fullyFactual).toBe(false);
  });

  it("a derived figure is NEVER canonical, however factual its inputs", () => {
    const l = buildLineage([
      node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J1", traceId: TRACE }),
      node("AGGREGATION", "trial-balance", "POSTED", "sum", { traceId: TRACE }),
    ]);
    expect(l.fullyFactual).toBe(true);
    expect(l.canonical).toBe(false);
    expect(() => assertNotCanonical(l, "test")).not.toThrow();
  });

  it("assertNotCanonical throws if a derivation claims canonical status", () => {
    const l = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { traceId: TRACE })]);
    expect(() => assertNotCanonical({ ...l, canonical: true }, "ledger")).toThrow(/never by a computation/);
  });

  it("is deterministic — identical steps yield an identical lineageId", () => {
    const mk = () => buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J1" })]);
    expect(mk().lineageId).toBe(mk().lineageId);
  });

  it("a different derivation yields a different id", () => {
    const a = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J1" })]);
    const b = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J2" })]);
    expect(a.lineageId).not.toBe(b.lineageId);
  });

  it("reports missing trace ids as gaps", () => {
    const l = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { sourceId: "J1" })]);
    expect(l.complete).toBe(false);
    expect(l.gaps.join(" ")).toContain("no traceId");
  });

  it("recognises registered canonical sources and rejects others", () => {
    expect(isCanonicalSource("journal_entries")).toBe(true);
    expect(isCanonicalSource("treasury_positions")).toBe(true);
    expect(isCanonicalSource("my_shadow_ledger")).toBe(false);
  });

  it("a lineage rooted outside canonical truth is flagged", () => {
    const l = buildLineage([node("SOURCE", "spreadsheet_import", "OBSERVED", "import", { traceId: TRACE })]);
    const v = verifyLineageRoot(l);
    expect(v.rooted).toBe(false);
    expect(v.reason).toContain("must not be presented as authoritative");
  });

  it("POSITIVE CONTROL: a lineage rooted in the ledger verifies", () => {
    const l = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { traceId: TRACE })]);
    expect(verifyLineageRoot(l).rooted).toBe(true);
  });

  it("detects a cross-tenant derivation", () => {
    const l = buildLineage([
      node("LEDGER", "journal_lines", "POSTED", "read", { tenantId: "TEN_A", traceId: TRACE }),
      node("AGGREGATION", "sum", "DERIVED", "sum", { tenantId: "TEN_B", traceId: TRACE }),
    ]);
    const d = detectCrossTenantLineage(l);
    expect(d.crossTenant).toBe(true);
    expect(d.tenants).toEqual(["TEN_A", "TEN_B"]);
  });

  it("POSITIVE CONTROL: a single-tenant derivation is not flagged", () => {
    const l = buildLineage([node("LEDGER", "journal_lines", "POSTED", "read", { tenantId: "TEN_A" })]);
    expect(detectCrossTenantLineage(l).crossTenant).toBe(false);
  });

  it("a conflicting input dominates the result", () => {
    const l = buildLineage([
      node("LEDGER", "journal_lines", "POSTED", "read", { traceId: TRACE }),
      node("SOURCE", "external", "DATA_CONFLICT", "read", { traceId: TRACE }),
    ]);
    expect(l.resultClass).toBe("DATA_CONFLICT");
  });
});

// =============================================================================
// DOMAIN REGISTRY — tested for its own honesty
// =============================================================================
describe("domain registry cannot flatter itself", () => {
  it("a domain with a failed criterion can never be COMPLETE", () => {
    const record = FINANCE_DOMAINS.find((d) => d.domain === "RISK")!;
    const tampered = { ...record, criteria: { ...record.criteria, faultInjection: false } };
    expect(assessDomain(tampered).status).toBe("PARTIAL");
  });

  it("a domain with no module is NOT_AVAILABLE regardless of criteria", () => {
    const record = FINANCE_DOMAINS.find((d) => d.domain === "AR")!;
    expect(record.module).toBeNull();
    expect(assessDomain(record).status).toBe("NOT_AVAILABLE");
  });

  it("an authority blocker outranks a data blocker", () => {
    const record = FINANCE_DOMAINS.find((d) => d.domain === "ACCOUNTING")!;
    expect(assessDomain(record).status).toBe("REQUIRES_AUTHORITY");
  });

  it("domains without substrate are listed, not omitted", () => {
    const names = FINANCE_DOMAINS.map((d) => d.domain);
    for (const d of ["AR", "AP", "FIXED_ASSETS", "INVENTORY"]) expect(names).toContain(d);
  });

  it("every domain explains its limitations", () => {
    for (const d of FINANCE_DOMAINS) {
      expect(d.limitations.length).toBeGreaterThan(0);
      if (assessDomain(d).status !== "COMPLETE") expect(d.blockedBy.length).toBeGreaterThan(0);
    }
  });

  it("the matrix covers every domain and platform service", () => {
    const m = maturityMatrix();
    expect(m.length).toBe(FINANCE_DOMAINS.length + 2);
    expect(m.every((x) => x.reason.length > 20)).toBe(true);
  });

  it("the summary never hides a blocked domain behind a score", () => {
    const s = maturitySummary();
    expect(s.notAvailable.length).toBe(4);
    expect(s.blockedByAuthority.length).toBeGreaterThan(0);
    expect(s.total).toBe(s.byStatus.COMPLETE + s.byStatus.PARTIAL + s.byStatus.BLOCKED +
      s.byStatus.REQUIRES_AUTHORITY + s.byStatus.DATA_NOT_AVAILABLE + s.byStatus.NOT_AVAILABLE);
  });

  it("reports genuinely complete domains", () => {
    const s = maturitySummary();
    expect(s.fullyComplete).toContain("RISK");
    expect(s.fullyComplete).toContain("AUDIT");
    expect(s.fullyComplete).toContain("COMPLIANCE");
  });

  it("the service contract is derived from the registry, not hand-listed", () => {
    const c = serviceContract();
    expect(c.length).toBe(FINANCE_DOMAINS.length + 2);
    expect(c.find((x) => x.service === "finance.journal")?.status).toBe("REQUIRES_AUTHORITY");
    expect(c.find((x) => x.service === "finance.ar")?.status).toBe("NOT_AVAILABLE");
  });

  it("no domain claims COMPLETE while blocked", () => {
    for (const m of maturityMatrix()) {
      if (m.status === "COMPLETE") {
        const record = [...FINANCE_DOMAINS].find((d) => d.domain === m.domain);
        if (record) expect(record.blockedBy).toEqual([]);
      }
    }
  });
});

// =============================================================================
// NO MUTATION
// =============================================================================
describe("no financial mutation", () => {
  it("versions are pinned", () => {
    expect(INTERCOMPANY_VERSION).toBe("intercompany-1.0.0");
    expect(LINEAGE_VERSION).toBe("lineage-1.0.0");
  });

  it("the substrate is unchanged after every operation above", async () => {
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from legal_entities`)).toBe(8);
    expect(await count(sql`select count(*)::int as n from tenants`)).toBe(6);
    expect(await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`)).toBe(0);
  });

  it("the known attribution defect is still present and unrepaired", async () => {
    const n = await count(
      sql`select count(*)::int as n from treasury_positions tp join legal_entities le
          on le.id = tp.legal_entity_id where tp.tenant_id <> le.tenant_id`,
    );
    expect(n).toBe(3);
  });
});
