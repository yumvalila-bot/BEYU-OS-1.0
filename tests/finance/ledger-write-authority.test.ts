import { describe, expect, it } from "vitest";
import { ROLES, HIGH_RISK_PERMISSIONS, PERMISSIONS } from "../../src/lib/constants";

/**
 * LEDGER WRITE AUTHORITY — detection of unauthorized financial capability.
 *
 * POLICY-INDEPENDENT. These tests encode NO accounting judgement: they assert
 * nothing about debits, credits, recognition, periods or measurement. They
 * assert only the *authority boundary* around financial writes, which is
 * already established authority in the repository:
 *
 *   - Constitution Art. 5 — Finance OS authority rests with the Group CFO.
 *   - Policy CONST-AI-001 r3 — AI may not post journal entries.
 *   - `finance:ledger.post` is HIGH_RISK and excluded from the GROUP_CEO wildcard.
 *
 * Phases 5B-5K established that BEYU has not yet ratified accounting policy, so
 * the posting service does not exist. The danger during that wait is that a
 * financial capability is introduced *quietly* — a new approval permission that
 * the GROUP_CEO wildcard silently absorbs, or one that `CONST-AI-001` does not
 * name and therefore does not deny to AI.
 *
 * These tests fail loudly if that happens. They are behavioural assertions over
 * the exported permission model, not assertions on source text.
 */

/** Every permission that grants the ability to write to the financial ledger. */
const LEDGER_WRITE_PERMISSIONS = Object.keys(PERMISSIONS).filter(
  (p) => p.startsWith("finance:ledger.") && p !== "finance:ledger.read",
);

describe("ledger write authority", () => {
  it("finance:ledger.post is the only ledger-write capability that exists", () => {
    // If a new one is added (e.g. finance:ledger.approve), this fails and forces
    // the author to confirm it was ratified and correctly constrained below.
    expect(LEDGER_WRITE_PERMISSIONS).toEqual(["finance:ledger.post"]);
  });

  it("every ledger-write capability is classified HIGH_RISK", () => {
    for (const permission of LEDGER_WRITE_PERMISSIONS) {
      expect(HIGH_RISK_PERMISSIONS).toContain(permission);
    }
  });

  it("GROUP_CFO is the only role holding any ledger-write capability", () => {
    for (const permission of LEDGER_WRITE_PERMISSIONS) {
      const holders = Object.entries(ROLES)
        .filter(([, role]) => (role.permissions as readonly string[]).includes(permission))
        .map(([code]) => code);
      expect(holders).toEqual(["GROUP_CFO"]);
    }
  });

  it("GROUP_CEO holds no ledger-write capability despite its wildcard grant", () => {
    // GROUP_CEO is built by filtering the full permission catalogue, so a new
    // finance:ledger.* permission would be granted automatically unless it is
    // explicitly excluded. That silent grant is the failure mode guarded here.
    const ceo = ROLES.GROUP_CEO.permissions as readonly string[];
    for (const permission of LEDGER_WRITE_PERMISSIONS) {
      expect(ceo).not.toContain(permission);
    }
  });

  it("no role outside GROUP_CFO accumulates a ledger-write capability", () => {
    const offenders = Object.entries(ROLES)
      .filter(([code]) => code !== "GROUP_CFO")
      .filter(([, role]) =>
        LEDGER_WRITE_PERMISSIONS.some((p) => (role.permissions as readonly string[]).includes(p)),
      )
      .map(([code]) => code);
    expect(offenders).toEqual([]);
  });

  it("no capital-execution or treasury-movement capability has been introduced", () => {
    // Capital execution remains unimplemented and unratified. A capability
    // appearing here would mean money movement became reachable without the
    // accounting authority that Phase 5 established as missing.
    const executionish = Object.keys(PERMISSIONS).filter((p) =>
      /capital\.(execute|fund)|treasury\.(transfer|move|execute)|ledger\.approve/.test(p),
    );
    expect(executionish).toEqual([]);
  });
});
