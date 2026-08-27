/**
 * Family Office — authority framework + delegation engine tests.
 *
 * Requirements covered: R13 (AI never an authority), R14 (missing
 * authority ≠ approval), R15 (tenant isolation + scope containment),
 * R16 (delegation chain verification), R17 (missing limitation →
 * POLICY_DECISION_REQUIRED, never "unlimited"), R18 (self-delegation /
 * empty scope refused).
 */

import { describe, expect, it } from "vitest";
import { AUTHORITY_TYPES, assertAuthority, isAuthorityCurrent, toTaxonomyCode, verifyAuthority } from "../../../src/lib/family/office/authority";
import { evaluateDelegation, requireLimitation, toVerifiedDelegation, validateDelegationRecord } from "../../../src/lib/family/office/delegation";
import { FamilyError } from "../../../src/lib/family/phase3/errors";
import { D, TENANT, TENANT_SCOPE, aiAuthority, delegationRecord, humanAuthority } from "./fixtures";

const ACT = { ...TENANT_SCOPE, action: "approve.capital.instruction", objectId: "OBJ-1" };

describe("R13 — AI is never an authority (FIR-017)", () => {
  it("an AI actor is refused even when it claims a resolution reference", () => {
    const result = verifyAuthority(aiAuthority(), ACT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("HUMAN_ACTOR_REQUIRED");
    expect(result.reason).toMatch(/AI/i);
  });

  it("assertAuthority throws the taxonomy code for an AI actor", () => {
    try {
      assertAuthority(aiAuthority(), ACT, D.asOf);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyError);
      expect((e as FamilyError).code).toBe("HUMAN_ACTOR_REQUIRED");
    }
  });
});

describe("R14 — missing authority is never approval", () => {
  it("an identity without an authority reference is AUTHORITY_REQUIRED", () => {
    const ctx = humanAuthority("user-1", "RES-1");
    const noRef = { ...ctx, authorityRef: null };
    const result = verifyAuthority(noRef, ACT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("AUTHORITY_REQUIRED");
    expect(result.reason).toMatch(/missing authority is never approval/i);
  });

  it("the taxonomy mapping keeps the granular code in details", () => {
    expect(toTaxonomyCode("AUTHORITY_REQUIRED")).toBe("AUTHORITY_UNPROVEN");
    expect(toTaxonomyCode("TENANT_SCOPE_MISMATCH")).toBe("TENANT_ISOLATION_DENIED");
    expect(toTaxonomyCode("HUMAN_ACTOR_REQUIRED")).toBe("HUMAN_ACTOR_REQUIRED");
  });
});

describe("R15 — tenant isolation and scope containment", () => {
  it("a cross-tenant actor is refused", () => {
    const ctx = { ...humanAuthority("user-1", "RES-1"), tenantId: "T-OTHER" };
    const result = verifyAuthority(ctx, ACT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TENANT_SCOPE_MISMATCH");
  });

  it("an entity-scope escape is refused", () => {
    const ctx = humanAuthority("user-1", "RES-1");
    const act = { ...ACT, legalEntityId: "LE-1" };
    const result = verifyAuthority(ctx, act);
    // Actor is tenant-wide (legalEntityId null) — the act is narrower, so
    // contained: this is permitted (narrowing is always allowed).
    expect(result.ok).toBe(true);
    // But an actor scoped to LE-2 cannot act on LE-1.
    const ctxOther = humanAuthority("user-1", "RES-1", { legalEntityId: "LE-2" });
    const result2 = verifyAuthority(ctxOther, act);
    expect(result2.ok).toBe(false);
    if (result2.ok) return;
    expect(result2.code).toBe("ENTITY_SCOPE_MISMATCH");
  });

  it("a jurisdiction-scope escape is refused", () => {
    const act = { ...ACT, jurisdictionRef: "TZ" };
    const ctx = humanAuthority("user-1", "RES-1", { jurisdictionRef: "KE" });
    const result = verifyAuthority(ctx, act);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("JURISDICTION_SCOPE_MISMATCH");
  });
});

describe("R16 — the delegation chain must fully verify", () => {
  const delegation = delegationRecord("DEL-1");
  const verified = toVerifiedDelegation(delegation, D.asOf);
  const map = new Map([["DEL-1", verified]]);

  it("a valid delegation verifies viaDelegation", () => {
    const ctx = { ...humanAuthority("user-secretary", "RES-DELEG"), authorityRef: { kind: "DELEGATION" as const, referenceId: "RES-DELEG" }, delegationRef: "DEL-1" };
    const result = verifyAuthority(ctx, ACT, map);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("DELEGATION");
    expect(result.viaDelegation).toBe(true);
  });

  it("a delegation not in the verified set is refused", () => {
    const ctx = { ...humanAuthority("user-secretary", "RES-DELEG"), authorityRef: { kind: "DELEGATION" as const, referenceId: "RES-DELEG" }, delegationRef: "DEL-UNKNOWN" };
    const result = verifyAuthority(ctx, ACT, map);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DELEGATION_INVALID");
  });

  it("an actor who is not the delegate is refused", () => {
    const ctx = { ...humanAuthority("user-imposter", "RES-DELEG"), authorityRef: { kind: "DELEGATION" as const, referenceId: "RES-DELEG" }, delegationRef: "DEL-1" };
    const result = verifyAuthority(ctx, ACT, map);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DELEGATION_INVALID");
  });

  it("a revoked delegation is refused", () => {
    const revoked = delegationRecord("DEL-2", { revokedAt: "2026-01-10", revokedBy: "user-chair" });
    const map2 = new Map([["DEL-2", toVerifiedDelegation(revoked, D.asOf)]]);
    const ctx = { ...humanAuthority("user-secretary", "RES-DELEG"), authorityRef: { kind: "DELEGATION" as const, referenceId: "RES-DELEG" }, delegationRef: "DEL-2" };
    const result = verifyAuthority(ctx, ACT, map2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("AUTHORITY_REVOKED");
  });

  it("an action outside the delegation is refused (a delegation proves only what it grants)", () => {
    const ctx = { ...humanAuthority("user-secretary", "RES-DELEG"), authorityRef: { kind: "DELEGATION" as const, referenceId: "RES-DELEG" }, delegationRef: "DEL-1" };
    const act = { ...ACT, action: "approve.loan.instruction" };
    const result = verifyAuthority(ctx, act, map);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("AUTHORITY_UNPROVEN");
  });

  it("the delegator cannot act through their own delegation", () => {
    const result = evaluateDelegation(delegation, { action: "approve.capital.instruction", actorUserId: "user-chair", asOf: D.asOf, entity: null, jurisdiction: null });
    expect(result.permitted).toBe(false);
    expect(result.code).toBe("DELEGATION_SCOPE_MISMATCH");
    expect(result.reason).toMatch(/delegator/i);
  });
});

describe("expiry is evaluated at an explicit asOf", () => {
  it("isAuthorityCurrent is true before expiry and false after", () => {
    const ctx = humanAuthority("user-1", "RES-1", { authorityExpiry: "2026-02-15" });
    expect(isAuthorityCurrent(ctx, "2026-02-14")).toBe(true);
    expect(isAuthorityCurrent(ctx, "2026-02-15")).toBe(true);
    expect(isAuthorityCurrent(ctx, "2026-02-16")).toBe(false);
  });

  it("an expired authority fails the asserting check", () => {
    const ctx = humanAuthority("user-1", "RES-1", { authorityExpiry: "2026-02-15" });
    try {
      assertAuthority(ctx, ACT, "2026-02-16");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyError);
      expect((e as FamilyError).code).toBe("AUTHORITY_UNPROVEN");
    }
  });

  it("AUTHORITY_TYPES is exactly the §26.4 set", () => {
    expect([...AUTHORITY_TYPES].sort()).toEqual(["DELEGATION", "RESOLUTION"]);
  });
});

describe("R17 — a missing ratified limitation is POLICY_DECISION_REQUIRED, never 'unlimited'", () => {
  it("limitations null + a required limitation → POLICY_DECISION_REQUIRED", () => {
    const result = evaluateDelegation(delegationRecord("DEL-NL"), {
      action: "approve.capital.instruction",
      actorUserId: "user-secretary",
      asOf: D.asOf,
      entity: null,
      jurisdiction: null,
      requiredLimitationKey: "maxDisbursement",
    });
    expect(result.permitted).toBe(false);
    expect(result.code).toBe("POLICY_DECISION_REQUIRED");
    expect(result.reason).toMatch(/never assumed/i);
  });

  it("a present limitation set missing the key → POLICY_DECISION_REQUIRED", () => {
    const d = delegationRecord("DEL-PARTIAL", { limitations: { otherCap: 10 } });
    const result = evaluateDelegation(d, {
      action: "approve.capital.instruction",
      actorUserId: "user-secretary",
      asOf: D.asOf,
      entity: null,
      jurisdiction: null,
      requiredLimitationKey: "maxDisbursement",
    });
    expect(result.permitted).toBe(false);
    expect(result.code).toBe("POLICY_DECISION_REQUIRED");
  });

  it("a present, matching limitation → PERMITTED with the applied limitation", () => {
    const d = delegationRecord("DEL-FULL", { limitations: { maxDisbursement: "REF-CAP-1" } });
    const result = evaluateDelegation(d, {
      action: "approve.capital.instruction",
      actorUserId: "user-secretary",
      asOf: D.asOf,
      entity: null,
      jurisdiction: null,
      requiredLimitationKey: "maxDisbursement",
    });
    expect(result.permitted).toBe(true);
    expect(result.appliedLimitation).toEqual({ key: "maxDisbursement", value: "REF-CAP-1" });
  });

  it("requireLimitation throws the taxonomy code when the value is absent", () => {
    expect(() => requireLimitation(delegationRecord("DEL-NL2"), "maxDisbursement")).toThrowError(FamilyError);
    const d = delegationRecord("DEL-OK", { limitations: { maxDisbursement: "REF-CAP-2" } });
    expect(requireLimitation<string>(d, "maxDisbursement")).toBe("REF-CAP-2");
  });

  it("delegation period is enforced at the requested asOf", () => {
    const d = delegationRecord("DEL-PERIOD", { effectiveFrom: "2026-04-01" });
    const early = evaluateDelegation(d, { action: "approve.capital.instruction", actorUserId: "user-secretary", asOf: D.asOf, entity: null, jurisdiction: null });
    expect(early.permitted).toBe(false);
    expect(early.code).toBe("DELEGATION_EXPIRED");
    const late = evaluateDelegation(d, { action: "approve.capital.instruction", actorUserId: "user-secretary", asOf: "2026-04-02", entity: null, jurisdiction: null });
    expect(late.permitted).toBe(true);
  });
});

describe("R18 — self-delegation and empty scope are refused", () => {
  it("self-delegation is a validation problem", () => {
    const d = delegationRecord("DEL-SELF", { delegateUserId: "user-chair" });
    const problems = validateDelegationRecord(d);
    expect(problems.some((p) => p.toLowerCase().includes("self-delegation"))).toBe(true);
    expect(() => evaluateDelegation(d, { action: "approve.capital.instruction", actorUserId: "user-chair", asOf: D.asOf, entity: null, jurisdiction: null })).toThrowError();
  });

  it("a delegation with no actions delegates nothing", () => {
    const d = delegationRecord("DEL-EMPTY");
    (d as unknown as { scope: { actions: string[] } }).scope.actions = [];
    const problems = validateDelegationRecord(d);
    expect(problems.some((p) => p.includes("non-empty"))).toBe(true);
  });

  it("toVerifiedDelegation marks validity and revocation at the requested time", () => {
    const d = delegationRecord("DEL-V", { effectiveFrom: "2026-01-01", effectiveTo: "2026-03-01" });
    expect(toVerifiedDelegation(d, "2026-02-01").validAt).toBe(true);
    expect(toVerifiedDelegation(d, "2026-03-02").validAt).toBe(false);
    const r = delegationRecord("DEL-R", { revokedAt: "2026-01-05", revokedBy: "user-chair" });
    expect(toVerifiedDelegation(r, "2026-01-04").revoked).toBe(false);
    expect(toVerifiedDelegation(r, "2026-01-06").revoked).toBe(true);
  });

  it("the authority context structurally has no role field (identity ≠ role ≠ authority)", () => {
    const ctx = humanAuthority("user-1", "RES-1");
    expect(Object.keys(ctx)).not.toContain("role");
    expect(Object.keys(ctx)).not.toContain("roles");
  });

  it("tenant constant sanity (fixtures share one tenant)", () => {
    expect(TENANT).toBe("T-1");
  });
});
