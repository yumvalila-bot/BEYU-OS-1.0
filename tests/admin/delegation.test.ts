import { describe, expect, it } from "vitest";
import {
  MAX_DELEGATION_DAYS,
  validateProposedDelegation,
  type ProposedAdminDelegation,
} from "../../src/lib/admin/delegation";
import { ADMIN_DELEGATABLE_PERMISSIONS, PERMISSIONS } from "../../src/lib/constants";

/**
 * The administrative delegation VALIDATION ENGINE — pure decision logic.
 *
 * The property under test is the constitutional one: a delegation can NEVER
 * create authority greater than the delegator possesses, and it can never be
 * re-delegated, self-granted, unscoped or permanent.
 */

const DAY = 86_400_000;
const now = new Date("2026-09-17T08:00:00.000Z");

function proposal(overrides: Partial<ProposedAdminDelegation> = {}): ProposedAdminDelegation {
  return {
    delegatorUserId: "USR_DELEGATOR",
    delegateeUserId: "USR_DELEGATEE",
    permissions: ["identity:user.suspend"],
    scopeTenantIds: ["TEN_BEYU_TZ"],
    effectiveFrom: now,
    effectiveTo: new Date(now.getTime() + 7 * DAY),
    reason: "Quarter-end coverage while I am travelling.",
    ...overrides,
  };
}

const fullPlatformAuthority = new Set(
  Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[],
);

describe("admin delegation — closed delegable set", () => {
  it("excludes the delegation capability itself: chains have depth exactly one", () => {
    expect(ADMIN_DELEGATABLE_PERMISSIONS).not.toContain("identity:delegation.manage");
    expect(ADMIN_DELEGATABLE_PERMISSIONS).not.toContain("identity:user.manage");
    expect(ADMIN_DELEGATABLE_PERMISSIONS).not.toContain("identity:user.read");
    expect(ADMIN_DELEGATABLE_PERMISSIONS).not.toContain("audit:log.read");
  });

  it("contains only capabilities that exist in the canonical catalogue", () => {
    for (const code of ADMIN_DELEGATABLE_PERMISSIONS) {
      expect(PERMISSIONS, `${code} must exist in PERMISSIONS`).toHaveProperty(code);
    }
  });

  it("permits a bounded, scoped delegation of a capability the delegator holds", () => {
    const verdict = validateProposedDelegation({
      proposal: proposal(),
      delegatorRolePermissions: fullPlatformAuthority,
      delegatorTenantScope: ["TEN_BEYU_GROUP", "TEN_BEYU_TZ", "TEN_BEYU_HEALTH"],
    });
    expect(verdict).toMatchObject({ permitted: true, decision: "VALID" });
  });
});

describe("admin delegation — fail-closed validation", () => {
  const ok = (overrides: Partial<ProposedAdminDelegation>) =>
    validateProposedDelegation({
      proposal: proposal(overrides),
      delegatorRolePermissions: fullPlatformAuthority,
      delegatorTenantScope: ["TEN_BEYU_GROUP", "TEN_BEYU_TZ"],
    });

  it("refuses self-delegation (self-escalation)", () => {
    const verdict = ok({ delegatorUserId: "USR_X", delegateeUserId: "USR_X" });
    expect(verdict).toMatchObject({ permitted: false, decision: "SELF_DELEGATION" });
  });

  it("refuses an empty capability set", () => {
    expect(ok({ permissions: [] })).toMatchObject({ permitted: false, decision: "EMPTY_CAPABILITIES" });
  });

  it("refuses non-delegable capabilities — including delegation itself and unknown codes", () => {
    expect(ok({ permissions: ["identity:delegation.manage"] })).toMatchObject({
      permitted: false,
      decision: "NON_DELEGABLE",
    });
    expect(ok({ permissions: ["identity:user.suspend", "platform:config.manage"] })).toMatchObject({
      permitted: false,
      decision: "NON_DELEGABLE",
    });
    expect(ok({ permissions: ["totally:made.up"] })).toMatchObject({
      permitted: false,
      decision: "NON_DELEGABLE",
    });
  });

  it("refuses capabilities the delegator does not hold through ROLE grants — no re-delegation", () => {
    const verdict = validateProposedDelegation({
      proposal: proposal({ permissions: ["organization:tenant.remove"] }),
      delegatorRolePermissions: new Set(["identity:user.suspend"]),
      delegatorTenantScope: ["TEN_BEYU_TZ"],
    });
    expect(verdict).toMatchObject({ permitted: false, decision: "EXCEEDS_DELEGATOR_AUTHORITY" });
  });

  it("refuses an empty tenant scope (scopeless authority)", () => {
    expect(ok({ scopeTenantIds: [] })).toMatchObject({ permitted: false, decision: "EMPTY_SCOPE" });
  });

  it("refuses scope outside the delegator's own resolved tenant scope", () => {
    const verdict = validateProposedDelegation({
      proposal: proposal({ scopeTenantIds: ["TEN_BEYU_FINTECH", "TEN_BEYU_TZ"] }),
      delegatorRolePermissions: fullPlatformAuthority,
      delegatorTenantScope: ["TEN_BEYU_TZ"],
    });
    expect(verdict).toMatchObject({ permitted: false, decision: "SCOPE_EXCEEDS_DELEGATOR" });
  });

  it("refuses an invalid or over-long window", () => {
    expect(
      ok({ effectiveFrom: now, effectiveTo: new Date(now.getTime() - DAY) }),
    ).toMatchObject({ permitted: false, decision: "INVALID_WINDOW" });
    expect(
      ok({ effectiveTo: new Date(now.getTime() + (MAX_DELEGATION_DAYS + 1) * DAY) }),
    ).toMatchObject({ permitted: false, decision: "WINDOW_TOO_LONG" });
  });

  it("accepts a window at exactly the maximum bound", () => {
    const verdict = ok({ effectiveTo: new Date(now.getTime() + MAX_DELEGATION_DAYS * DAY) });
    expect(verdict.permitted).toBe(true);
  });
});
