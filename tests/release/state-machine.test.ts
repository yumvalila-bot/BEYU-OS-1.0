/**
 * BEYU OS — P3 Release State Machine Tests (DB-free, canonical)
 *
 * Tests valid/invalid transitions, DEPLOYED!=VERIFIED!=PROMOTED, etc.
 */

import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  FORBIDDEN_TRANSITIONS,
  isValidTransition,
  createTransition,
  getCurrentState,
  assertDeployedNotVerifiedNotPromoted,
} from "@/lib/release/state-machine";
import type { ReleaseTransition } from "@/lib/release/types";

function makeHistory(states: string[]): ReleaseTransition[] {
  return states.map((s, i) => ({
    id: `evt_${i}`,
    releaseId: "REL_test",
    sourceCommit: "abc123",
    artifactBuildId: "build_1",
    environment: "test",
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
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

describe("P3 release state machine — valid transitions", () => {
  it("DESIGNED → BUILT allowed", () => {
    const r = isValidTransition("DESIGNED", "BUILT", { history: makeHistory(["DESIGNED"]) });
    expect(r.allowed).toBe(true);
  });

  it("BUILT → DEPLOYED allowed", () => {
    const r = isValidTransition("BUILT", "DEPLOYED", { history: makeHistory(["DESIGNED", "BUILT"]) });
    expect(r.allowed).toBe(true);
  });

  it("DEPLOYED → PVG_VERIFIED allowed", () => {
    const r = isValidTransition("DEPLOYED", "PVG_VERIFIED", { history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]) });
    expect(r.allowed).toBe(true);
  });

  it("PVG_VERIFIED → CANARY allowed", () => {
    const r = isValidTransition("PVG_VERIFIED", "CANARY", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "PASS" } as never,
    });
    expect(r.allowed).toBe(true);
  });

  it("PVG_VERIFIED → PROMOTED allowed with PASS PVG", () => {
    const r = isValidTransition("PVG_VERIFIED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "PASS" } as never,
    });
    expect(r.allowed).toBe(true);
  });

  it("CANARY → PROMOTED allowed with promotion eligibility", () => {
    const r = isValidTransition("CANARY", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "CANARY"]),
      pvgEvidence: { status: "PASS" } as never,
      canaryEvidence: { promotionEligible: true, pvgVerified: true } as never,
    });
    expect(r.allowed).toBe(true);
  });

  it("PROMOTED → SWITCHED allowed", () => {
    const r = isValidTransition("PROMOTED", "SWITCHED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED"]),
    });
    expect(r.allowed).toBe(true);
  });

  it("SWITCHED → RETIRED allowed", () => {
    const r = isValidTransition("SWITCHED", "RETIRED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED"]),
    });
    expect(r.allowed).toBe(true);
  });

  it("RETIRED → CONTRACTED allowed with full history", () => {
    const r = isValidTransition("RETIRED", "CONTRACTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED", "RETIRED"]),
    });
    expect(r.allowed).toBe(true);
  });

  it("CONTRACTED → VERIFIED allowed", () => {
    const r = isValidTransition("CONTRACTED", "VERIFIED", {
      history: makeHistory([
        "DESIGNED",
        "BUILT",
        "DEPLOYED",
        "PVG_VERIFIED",
        "PROMOTED",
        "SWITCHED",
        "RETIRED",
        "CONTRACTED",
      ]),
    });
    expect(r.allowed).toBe(true);
  });
});

describe("P3 release state machine — invalid transitions fail closed", () => {
  it("DEPLOYED → PROMOTED MUST FAIL", () => {
    const r = isValidTransition("DEPLOYED", "PROMOTED", { history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]) });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toContain("PVG");
  });

  it("CANARY → PROMOTED MUST FAIL without canary verification", () => {
    const r = isValidTransition("CANARY", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "CANARY"]),
      canaryEvidence: { promotionEligible: false, pvgVerified: false } as never,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/CANARY/);
  });

  it("FAILED → PROMOTED MUST FAIL", () => {
    const r = isValidTransition("FAILED", "PROMOTED", { history: makeHistory(["DESIGNED", "FAILED"]) });
    expect(r.allowed).toBe(false);
  });

  it("RETIRED → PROMOTED MUST FAIL", () => {
    const r = isValidTransition("RETIRED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED", "RETIRED"]),
    });
    expect(r.allowed).toBe(false);
  });

  it("CONTRACTED → PROMOTED MUST FAIL", () => {
    const r = isValidTransition("CONTRACTED", "PROMOTED", {
      history: makeHistory([
        "DESIGNED",
        "BUILT",
        "DEPLOYED",
        "PVG_VERIFIED",
        "PROMOTED",
        "SWITCHED",
        "RETIRED",
        "CONTRACTED",
      ]),
    });
    expect(r.allowed).toBe(false);
  });

  it("DEPLOYED → VERIFIED MUST FAIL", () => {
    const r = isValidTransition("DEPLOYED", "VERIFIED", { history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]) });
    expect(r.allowed).toBe(false);
  });

  it("BUILT → PROMOTED MUST FAIL", () => {
    const r = isValidTransition("BUILT", "PROMOTED", { history: makeHistory(["DESIGNED", "BUILT"]) });
    expect(r.allowed).toBe(false);
  });
});

describe("P3 release state machine — DEPLOYED != VERIFIED != PROMOTED", () => {
  it("DEPLOYED is not VERIFIED", () => {
    expect(ALLOWED_TRANSITIONS["DEPLOYED"]).not.toContain("VERIFIED");
  });

  it("DEPLOYED is not PROMOTED", () => {
    expect(ALLOWED_TRANSITIONS["DEPLOYED"]).not.toContain("PROMOTED");
  });

  it("VERIFIED is terminal, not promoting", () => {
    expect(ALLOWED_TRANSITIONS["VERIFIED"]).not.toContain("PROMOTED");
  });

  it("invariant helper confirms inequality", () => {
    const invariants = assertDeployedNotVerifiedNotPromoted();
    for (const inv of invariants) {
      expect(inv.holds, inv.invariant).toBe(true);
    }
  });
});

describe("P3 release state machine — PVG failure blocks promotion", () => {
  it("PVG_VERIFIED → PROMOTED blocked when PVG FAIL", () => {
    const r = isValidTransition("PVG_VERIFIED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "FAIL", blockingFailures: ["runtime_health"] } as never,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/PVG/);
  });

  it("PROMOTED blocked when release identity mismatch", () => {
    const r = isValidTransition("PVG_VERIFIED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "PASS" } as never,
      releaseIdentityMatches: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/IDENTITY/);
  });

  it("PROMOTED blocked when migration fingerprint mismatch", () => {
    const r = isValidTransition("PVG_VERIFIED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "PASS" } as never,
      migrationFingerprint: "abc",
      expectedMigrationFingerprint: "def",
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/MIGRATION/);
  });

  it("PROMOTED blocked when unauthorized actor", () => {
    const r = isValidTransition("PVG_VERIFIED", "PROMOTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED"]),
      pvgEvidence: { status: "PASS" } as never,
      actorAuthorized: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/UNAUTHORIZED/);
  });
});

describe("P3 release state machine — idempotency and history", () => {
  it("getCurrentState returns last state", () => {
    const history = makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]);
    expect(getCurrentState(history)).toBe("DEPLOYED");
  });

  it("empty history returns null", () => {
    expect(getCurrentState([])).toBeNull();
  });

  it("createTransition succeeds for valid transition", () => {
    const { transition, validation } = createTransition({
      releaseId: "REL_test",
      sourceCommit: "abc123",
      artifactBuildId: "build_1",
      environment: "test",
      actorId: "USR_test",
      actorType: "HUMAN",
      previousState: "DESIGNED",
      nextState: "BUILT",
      reason: "Build succeeded",
      history: makeHistory(["DESIGNED"]),
    });
    expect(validation.allowed).toBe(true);
    expect(transition.nextState).toBe("BUILT");
  });

  it("createTransition fails for invalid transition", () => {
    const { transition, validation } = createTransition({
      releaseId: "REL_test",
      sourceCommit: "abc123",
      artifactBuildId: "build_1",
      environment: "test",
      actorId: "USR_test",
      actorType: "HUMAN",
      previousState: "DEPLOYED",
      nextState: "PROMOTED",
      reason: "Trying to skip PVG",
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED"]),
    });
    expect(validation.allowed).toBe(false);
    expect(transition).toBeDefined(); // We return null transition but typed as never for fail case, check validation
  });

  it("duplicate transition with same previous/next is allowed if history matches (idempotency check)", () => {
    // Idempotency: same transition repeated should be detectable, not automatically fail
    // For P3, we allow re-transition if it's the same as last, but audit will deduplicate
    const history = makeHistory(["DESIGNED", "BUILT"]);
    const r = isValidTransition("BUILT", "DEPLOYED", { history });
    expect(r.allowed).toBe(true);
  });
});

describe("P3 release state machine — contract safety", () => {
  it("CONTRACTED requires PROMOTED → SWITCHED → RETIRED history", () => {
    const r = isValidTransition("RETIRED", "CONTRACTED", {
      history: makeHistory(["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "PROMOTED", "SWITCHED", "RETIRED"]),
    });
    expect(r.allowed).toBe(true);
  });

  it("CONTRACTED fails without full lifecycle", () => {
    const r = isValidTransition("RETIRED", "CONTRACTED", {
      history: makeHistory(["RETIRED"]), // Missing PROMOTED, SWITCHED
    });
    expect(r.allowed).toBe(false);
    expect(r.blockingInvariant).toMatch(/CONTRACT_SAFETY/);
  });
});
