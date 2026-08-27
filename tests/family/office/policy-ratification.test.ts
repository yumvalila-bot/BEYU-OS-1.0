/**
 * Family Office — policy engine + ratification registry tests.
 *
 * Requirements covered: R1 (5-state machine), R2 (unresolved →
 * POLICY_DECISION_REQUIRED, never a default), R3 (unratified values
 * refused), R4 (resolution at asOf), R5 (missing parameter),
 * R6 (supersession latest-only), R7 (revocation terminal),
 * R8 (seven questions), R9 (AI cannot ratify), R10 (existence ≠ effect),
 * R11 (authority kind RESOLUTION|DELEGATION only), R12 (pure
 * registration; corrections are new versions).
 */

import { describe, expect, it } from "vitest";
import {
  POLICY_STATES,
  buildPolicyRegistry,
  canTransitionPolicy,
  parametersOf,
  resolvePolicy,
  revokePolicyVersion,
  supersedePolicyVersion,
  type FamilyPolicyVersion,
} from "../../../src/lib/family/office/policy";
import {
  activeRatification,
  activateWhenEffective,
  buildRatificationRegistry,
  effectiveSince,
  registerRatification,
  underWhatAuthority,
  supportingInstrument,
  whatRemainsUnresolved,
  whatWasSuperseded,
  whoRatified,
} from "../../../src/lib/family/office/ratification";
import { familyError, FamilyError } from "../../../src/lib/family/phase3/errors";
import { D, TENANT_SCOPE, policyDef, policyVersion, ratificationRecord } from "./fixtures";

const QUORUM_DEF = policyDef("governance.quorum", "FAMILY_GOVERNANCE", { quorum: "NUMBER" });

function emptyRegistry() {
  return buildRatificationRegistry([QUORUM_DEF], [], []);
}

describe("R1 — the policy 5-state machine is enforced", () => {
  it("allows exactly the legal transitions", () => {
    expect(canTransitionPolicy("UNRESOLVED", "PROPOSED")).toBe(true);
    expect(canTransitionPolicy("UNRESOLVED", "REVOKED")).toBe(true);
    expect(canTransitionPolicy("PROPOSED", "RATIFIED")).toBe(true);
    expect(canTransitionPolicy("PROPOSED", "REVOKED")).toBe(true);
    expect(canTransitionPolicy("RATIFIED", "ACTIVE")).toBe(true);
    expect(canTransitionPolicy("RATIFIED", "REVOKED")).toBe(true);
    expect(canTransitionPolicy("ACTIVE", "SUPERSEDED")).toBe(true);
    expect(canTransitionPolicy("ACTIVE", "REVOKED")).toBe(true);
  });

  it("refuses illegal transitions (no backwards, no terminal re-entry)", () => {
    expect(canTransitionPolicy("ACTIVE", "UNRESOLVED")).toBe(false);
    expect(canTransitionPolicy("SUPERSEDED", "ACTIVE")).toBe(false);
    expect(canTransitionPolicy("REVOKED", "PROPOSED")).toBe(false);
    expect(canTransitionPolicy("REVOKED", "REVOKED")).toBe(false);
    expect(canTransitionPolicy("UNRESOLVED", "ACTIVE")).toBe(false);
  });
});

describe("R2 — UNRESOLVED fails closed: never a default", () => {
  it("a defined policy with no version is POLICY_DECISION_REQUIRED", () => {
    const registry = buildPolicyRegistry([QUORUM_DEF], []);
    const outcome = resolvePolicy(registry, "governance.quorum", D.asOf);
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
    expect((outcome as { reason: string }).reason).toMatch(/UNRESOLVED/i);
  });

  it("an unknown policy key is POLICY_DECISION_REQUIRED (absence is not a default)", () => {
    const registry = buildPolicyRegistry([QUORUM_DEF], []);
    const outcome = resolvePolicy(registry, "loan.interestRate", D.asOf);
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("a version not yet effective at asOf does not resolve", () => {
    const v = policyVersion("governance.quorum", 1, "ACTIVE", {
      effectiveFrom: "2026-06-01",
      parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
      ratificationDecisionId: "RES-F1",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v]);
    expect(resolvePolicy(registry, "governance.quorum", D.asOf).state).toBe("POLICY_DECISION_REQUIRED");
  });
});

describe("R3 — policy invention is refused at registry construction", () => {
  it("an UNRESOLVED version carrying values is refused", () => {
    const v = policyVersion("governance.quorum", 1, "UNRESOLVED", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
    });
    expect(() => buildPolicyRegistry([QUORUM_DEF], [v])).toThrowError(/POLICY_INVENTION_REFUSED|must not carry parameter values/);
  });

  it("a PROPOSED version carrying values is refused", () => {
    const v = policyVersion("governance.quorum", 1, "PROPOSED", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
    });
    expect(() => buildPolicyRegistry([QUORUM_DEF], [v])).toThrowError(/must not carry parameter values/);
  });

  it("an unratified version WITHOUT values is accepted (structure is allowed, values are not)", () => {
    const v = policyVersion("governance.quorum", 1, "PROPOSED");
    const registry = buildPolicyRegistry([QUORUM_DEF], [v]);
    expect(resolvePolicy(registry, "governance.quorum", D.asOf).state).toBe("POLICY_DECISION_REQUIRED");
  });
});

describe("R4 — resolution at an explicit point in time", () => {
  it("resolves the ACTIVE version within its period, with its ratified parameters", () => {
    const v = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
      ratificationDecisionId: "RES-1",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v]);
    const outcome = resolvePolicy<{ quorum: number }>(registry, "governance.quorum", D.asOf);
    expect(outcome.state).toBe("RESOLVED");
    if (outcome.state !== "RESOLVED") return;
    expect(outcome.version).toBe(1);
    expect(outcome.value.quorum).toBe(3);
    expect(outcome.ratificationDecisionId).toBe("RES-1");
  });

  it("superseded versions no longer resolve; the successor does", () => {
    const v1 = policyVersion("governance.quorum", 1, "SUPERSEDED", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 2 }],
      ratificationDecisionId: "RES-1",
    });
    const v2 = policyVersion("governance.quorum", 2, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 4 }],
      supersedesVersion: 1,
      ratificationDecisionId: "RES-2",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1, v2]);
    const outcome = resolvePolicy<{ quorum: number }>(registry, "governance.quorum", D.asOf);
    expect(outcome.state).toBe("RESOLVED");
    if (outcome.state !== "RESOLVED") return;
    expect(outcome.version).toBe(2);
    expect(outcome.value.quorum).toBe(4);
  });
});

describe("R5 — a missing parameter is POLICY_DECISION_REQUIRED, never undefined-as-default", () => {
  it("parametersOf on an absent field fails closed", () => {
    const v = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
      ratificationDecisionId: "RES-F2",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v]);
    const outcome = resolvePolicy(registry, "governance.quorum", D.asOf);
    expect(outcome.state).toBe("RESOLVED");
    if (outcome.state !== "RESOLVED") return;
    const missing = parametersOf<number>(outcome, "majority");
    expect(missing.state).toBe("POLICY_DECISION_REQUIRED");
  });
});

describe("R6 — supersession is latest-only and deterministic", () => {
  it("supersedePolicyVersion moves the target to SUPERSEDED and the new version into place", () => {
    const v1 = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 2 }],
      ratificationDecisionId: "RES-1",
    });
    const v2 = policyVersion("governance.quorum", 2, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 5 }],
      supersedesVersion: 1,
      ratificationDecisionId: "RES-2",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1]);
    const next = supersedePolicyVersion(registry, "governance.quorum", v2, 1);
    const list = next.versions.get("governance.quorum")!;
    expect(list.find((v) => v.version === 1)!.status).toBe("SUPERSEDED");
    expect(list.find((v) => v.version === 2)!.status).toBe("ACTIVE");
  });

  it("a new version must name the version it supersedes", () => {
    const v1 = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 2 }],
      ratificationDecisionId: "RES-1",
    });
    const v2Bad = policyVersion("governance.quorum", 2, "ACTIVE", { parameters: [{ key: "quorum", kind: "NUMBER", value: 5 }], supersedesVersion: null });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1]);
    expect(() => supersedePolicyVersion(registry, "governance.quorum", v2Bad, 1)).toThrowError(/must name the version it supersedes/);
  });

  it("only RATIFIED/ACTIVE versions can be superseded", () => {
    const v1 = policyVersion("governance.quorum", 1, "PROPOSED");
    const v2 = policyVersion("governance.quorum", 2, "ACTIVE", {
      supersedesVersion: 1,
      parameters: [{ key: "quorum", kind: "NUMBER", value: 5 }],
      ratificationDecisionId: "RES-2",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1]);
    expect(() => supersedePolicyVersion(registry, "governance.quorum", v2, 1)).toThrowError(/only RATIFIED\/ACTIVE/);
  });
});

describe("R7 — revocation is terminal and audit-referenced", () => {
  it("revokes an ACTIVE version; it no longer resolves", () => {
    const v1 = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 2 }],
      ratificationDecisionId: "RES-1",
    });
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1]);
    const next = revokePolicyVersion(registry, "governance.quorum", 1, "AUD-REVOKE-1");
    expect(next.versions.get("governance.quorum")![0].status).toBe("REVOKED");
    expect(resolvePolicy(next, "governance.quorum", D.asOf).state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("refuses to revoke a terminal version and refuses a silent revocation", () => {
    const v1 = policyVersion("governance.quorum", 1, "REVOKED");
    const registry = buildPolicyRegistry([QUORUM_DEF], [v1]);
    expect(() => revokePolicyVersion(registry, "governance.quorum", 1, "AUD-X")).toThrowError(/already REVOKED/);
    const v2 = policyVersion("governance.quorum", 1, "ACTIVE", {
      parameters: [{ key: "quorum", kind: "NUMBER", value: 2 }],
      ratificationDecisionId: "RES-2",
    });
    const registry2 = buildPolicyRegistry([QUORUM_DEF], [v2]);
    expect(() => revokePolicyVersion(registry2, "governance.quorum", 1, "")).toThrowError(/audit reference/);
  });
});

describe("R8 — the ratification registry answers the seven questions, with no fabricated answers", () => {
  const v1 = policyVersion("governance.quorum", 1, "ACTIVE", {
    parameters: [{ key: "quorum", kind: "NUMBER", value: 3 }],
    ratificationDecisionId: "RES-2026-041",
  });
  const rec1 = ratificationRecord("RES-2026-041", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }], {
    decisionMaker: "Amara M. (Chair)",
    authorityReferenceId: "RES-2026-040",
  });
  const registry = buildRatificationRegistry([QUORUM_DEF], [v1], [rec1]);

  it("1. who ratified", () => {
    expect(whoRatified(registry, "governance.quorum", D.asOf)).toBe("Amara M. (Chair)");
  });
  it("2. under what authority", () => {
    expect(underWhatAuthority(registry, "governance.quorum", D.asOf)).toEqual({ kind: "RESOLUTION", referenceId: "RES-2026-040" });
  });
  it("3. the supporting instrument", () => {
    expect(supportingInstrument(registry, "governance.quorum", D.asOf)).toBe("INST-governance.quorum");
  });
  it("4. effective since", () => {
    expect(effectiveSince(registry, "governance.quorum", D.asOf)).toBe(D.effectiveFrom);
  });
  it("5. what was superseded (null when nothing)", () => {
    expect(whatWasSuperseded(registry, "governance.quorum", D.asOf)).toBeNull();
  });
  it("6. what remains unresolved (the honest gap list)", () => {
    expect(whatRemainsUnresolved(registry, D.asOf)).toEqual([]);
  });
  it("7. the active ratification record", () => {
    expect(activeRatification(registry, "governance.quorum", D.asOf)!.decisionId).toBe("RES-2026-041");
  });
  it("answers nothing it was not told: unknown policy → nulls and the key in the gap list", () => {
    const def2 = policyDef("loan.terms", "FAMILY_LOAN", { interestRateMin: "NUMBER" });
    const registry2 = buildRatificationRegistry([QUORUM_DEF, def2], [v1], [rec1]);
    expect(whoRatified(registry2, "loan.terms", D.asOf)).toBeNull();
    expect(underWhatAuthority(registry2, "loan.terms", D.asOf)).toBeNull();
    expect(supportingInstrument(registry2, "loan.terms", D.asOf)).toBeNull();
    expect(effectiveSince(registry2, "loan.terms", D.asOf)).toBeNull();
    expect(whatRemainsUnresolved(registry2, D.asOf)).toEqual(["loan.terms"]);
  });
});

describe("R9 — an AI actor cannot ratify (FIR-017)", () => {
  it.each(["AI", "NOELIA", "HIVE"])(
    "decision maker %s is refused by record validation",
    (name) => {
      const rec = ratificationRecord("RES-X", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }], { decisionMaker: name });
      expect(() => registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.asOf)).toThrowError(FamilyError);
      const thrown = (() => {
        try {
          registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.asOf);
          return null;
        } catch (e) {
          return e as FamilyError;
        }
      })();
      expect(thrown!.code).toBe("AUTHORITY_UNPROVEN");
      expect(thrown!.message).toMatch(/AI actor/);
    },
  );
});

describe("R10 — existence never equals effect", () => {
  it("a ratification registered before its effective date is RATIFIED, not ACTIVE", () => {
    const rec = ratificationRecord("RES-LATE", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }], {
      effectiveFrom: "2026-02-01",
    });
    const outcome = registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.beforeEffective);
    expect(outcome.activated).toBe(false);
    const v = outcome.registry.policies.versions.get("governance.quorum")![0];
    expect(v.status).toBe("RATIFIED");
    // Not resolvable before the effective date.
    expect(resolvePolicy(outcome.registry.policies, "governance.quorum", D.beforeEffective).state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("activateWhenEffective flips the version at its effective date and only then", () => {
    const rec = ratificationRecord("RES-LATE", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }], {
      effectiveFrom: "2026-02-01",
    });
    const { registry } = registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.beforeEffective);
    // Still before the effective date: unchanged.
    const early = activateWhenEffective(registry, "governance.quorum", D.beforeEffective);
    expect(early.policies.versions.get("governance.quorum")![0].status).toBe("RATIFIED");
    // On/after the effective date: ACTIVE.
    const due = activateWhenEffective(registry, "governance.quorum", "2026-02-01");
    expect(due.policies.versions.get("governance.quorum")![0].status).toBe("ACTIVE");
    expect(resolvePolicy(due.policies, "governance.quorum", D.asOf).state).toBe("RESOLVED");
  });
});

describe("R11 — ratification authority is RESOLUTION or DELEGATION only", () => {
  it("a foreign authority kind is refused at registration", () => {
    const rec = ratificationRecord("RES-BAD", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }], {
      authorityKind: "DELEGATION" as never,
    });
    // Corrupt the kind to prove the check (not the fixture) is what refuses.
    (rec as { authorityRef: { kind: string } }).authorityRef.kind = "INSTRUMENT";
    expect(() => registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.asOf)).toThrowError(FamilyError);
  });
});

describe("R12 — registration is pure; a correction is a new version", () => {
  it("does not mutate the input registry", () => {
    const registry = emptyRegistry();
    const before = JSON.stringify([...registry.policies.versions.values()]);
    const rec = ratificationRecord("RES-PURE", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }]);
    registerRatification(registry, rec, TENANT_SCOPE, D.asOf);
    expect(JSON.stringify([...registry.policies.versions.values()])).toBe(before);
    expect(registry.policies.versions.get("governance.quorum")).toBeUndefined();
  });

  it("refuses to register the same version twice (no silent edits)", () => {
    const rec = ratificationRecord("RES-DUP", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }]);
    const { registry } = registerRatification(emptyRegistry(), rec, TENANT_SCOPE, D.asOf);
    const rec2 = ratificationRecord("RES-DUP-2", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }]);
    expect(() => registerRatification(registry, rec2, TENANT_SCOPE, D.asOf)).toThrowError(/already exists/);
  });
});

describe("R6/R8 — supersession through the ratification registry is latest-only", () => {
  it("superseding a non-latest ratification is refused", () => {
    const rec1 = ratificationRecord("RES-A", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 2 }]);
    const { registry: after1 } = registerRatification(emptyRegistry(), rec1, TENANT_SCOPE, D.asOf);
    const rec2 = ratificationRecord("RES-B", "governance.quorum", 2, [{ key: "quorum", kind: "NUMBER", value: 4 }], {
      supersedesDecisionId: "RES-A",
      version: 2,
    });
    const { registry: after2 } = registerRatification(after1, rec2, TENANT_SCOPE, D.asOf);
    // Now RES-B is the latest; superseding RES-A (non-latest) must fail.
    const rec3 = ratificationRecord("RES-C", "governance.quorum", 3, [{ key: "quorum", kind: "NUMBER", value: 6 }], {
      supersedesDecisionId: "RES-A",
      version: 3,
    });
    expect(() => registerRatification(after2, rec3, TENANT_SCOPE, D.asOf)).toThrowError(/is the latest ratification/);
    // And the seven questions reflect the live chain.
    expect(whoRatified(after2, "governance.quorum", D.asOf)).toBe("Human Chair (fixture)");
    expect(whatWasSuperseded(after2, "governance.quorum", D.asOf)).toBe("RES-A");
    expect(resolvePolicy(after2.policies, "governance.quorum", D.asOf).state).toBe("RESOLVED");
  });

  it("the states of the ratification records follow the chain", () => {
    const rec1 = ratificationRecord("RES-A", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 2 }]);
    const { registry: after1 } = registerRatification(emptyRegistry(), rec1, TENANT_SCOPE, D.asOf);
    const rec2 = ratificationRecord("RES-B", "governance.quorum", 2, [{ key: "quorum", kind: "NUMBER", value: 4 }], {
      supersedesDecisionId: "RES-A",
      version: 2,
    });
    const { registry: after2 } = registerRatification(after1, rec2, TENANT_SCOPE, D.asOf);
    expect(after2.records.get("RES-A")!.status).toBe("SUPERSEDED");
    expect(after2.records.get("RES-B")!.status).toBe("RATIFIED");
    const v1: FamilyPolicyVersion | undefined = after2.policies.versions.get("governance.quorum")!.find((v) => v.version === 1);
    expect(v1!.status).toBe("SUPERSEDED");
  });
});

describe("R2 (guard) — familyError carries the taxonomy code", () => {
  it("POLICY_INVENTION_REFUSED is the code used for unratified values", () => {
    try {
      buildPolicyRegistry([QUORUM_DEF], [policyVersion("governance.quorum", 1, "PROPOSED", { parameters: [{ key: "quorum", kind: "NUMBER", value: 1 }] })]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyError);
      expect((e as FamilyError).code).toBe("POLICY_INVENTION_REFUSED");
    }
  });
  // Keep the import used even if a future refactor changes the throw site.
  it("familyError helper returns the taxonomy code", () => {
    const err = familyError("POLICY_INVENTION_REFUSED", "x", []);
    expect(err.code).toBe("POLICY_INVENTION_REFUSED");
  });
});
