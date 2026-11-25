import { describe, expect, it } from "vitest";
import {
  AGENT_SKILLS,
  SKILL_LIFECYCLE_STAGES,
  assertSkillLifecycleOrder,
  assertSkillRegistryIntegrity,
  furthestCompleteStage,
  skillCapabilitiesWithinWorkforce,
  skillRegistrySummary,
  stageIndex,
  type AgentSkill,
  type SkillLifecycleStage,
  type SkillStageRecord,
} from "@/lib/noelia/cognitive/agent-skills";
import { NOELIA_BRAINS } from "@/lib/noelia/cognitive/brain-contracts";
import { HIVE_WORKFORCE_PROFILES, type WorkforceCapabilityIndex } from "@/lib/noelia/cognitive/workforce";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";

/**
 * Skills are a declaration over the SAME governed capabilities the workforce
 * uses, so these tests check the properties that make that safe: order, honesty,
 * containment within existing authority, and a hard stop at the human gate.
 */

function liveIndex(): WorkforceCapabilityIndex {
  const registry = createDefaultNoeliaToolRegistry();
  const rows = registry.list() as unknown as { name: string; risk?: string }[];
  const registered = new Set(rows.map((row) => row.name));
  const riskByName = new Map(rows.map((row) => [row.name, row.risk ?? "LOW"] as const));
  return {
    registered,
    riskOf: (capability) => (riskByName.get(capability) as "LOW" | "MEDIUM" | "HIGH" | undefined) ?? null,
  };
}

/** Build a throwaway skill so the guards can be tested against bad input. */
function skill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  const base: AgentSkill = {
    code: "TEST_SKILL",
    title: "Test skill",
    brain: "KNOWLEDGE",
    purpose: "For guard testing only.",
    capabilities: ["analytics.run"],
    lifecycle: SKILL_LIFECYCLE_STAGES.map((stage) => ({
      stage,
      state: "NOT_STARTED",
      evidence: null,
      blockedReason: null,
    })),
    readyForHumanGate: false,
  };
  return { ...base, ...overrides };
}

function withStage(s: AgentSkill, stage: SkillLifecycleStage, patch: Partial<SkillStageRecord>): AgentSkill {
  return {
    ...s,
    lifecycle: s.lifecycle.map((record) => (record.stage === stage ? { ...record, ...patch } : record)),
  };
}

describe("Skill lifecycle — the seven stages", () => {
  it("declares exactly the seven canonical stages in order", () => {
    expect(SKILL_LIFECYCLE_STAGES).toEqual([
      "SPECIFY",
      "PLAN",
      "BUILD",
      "TEST",
      "REVIEW",
      "SIMPLIFY",
      "SHIP",
    ]);
    expect(SKILL_LIFECYCLE_STAGES).toHaveLength(7);
  });

  it("stops at SHIP — there is no merge, deploy or publish stage", () => {
    // This is the constitutional stop. If a stage is ever added past SHIP, this
    // test fails and a human has to justify it.
    for (const forbidden of ["MERGE", "DEPLOY", "PUBLISH", "RELEASE", "PRODUCTION"]) {
      expect(SKILL_LIFECYCLE_STAGES).not.toContain(forbidden);
    }
    expect(SKILL_LIFECYCLE_STAGES.at(-1)).toBe("SHIP");
  });

  it("indexes stages monotonically from zero", () => {
    SKILL_LIFECYCLE_STAGES.forEach((stage, i) => {
      expect(stageIndex(stage)).toBe(i);
    });
  });
});

describe("The skill catalogue is structurally sound", () => {
  it("passes the integrity guard against the live registry", () => {
    expect(() => assertSkillRegistryIntegrity(liveIndex())).not.toThrow();
  });

  it("declares unique codes", () => {
    const codes = AGENT_SKILLS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("binds every skill to a declared brain", () => {
    const brainIds = new Set(NOELIA_BRAINS.map((b) => b.id));
    for (const s of AGENT_SKILLS) expect(brainIds.has(s.brain)).toBe(true);
  });

  it("gives every skill all seven stages in order", () => {
    for (const s of AGENT_SKILLS) {
      expect(s.lifecycle.map((r) => r.stage)).toEqual([...SKILL_LIFECYCLE_STAGES]);
    }
  });
});

describe("Skills cannot exceed workforce authority", () => {
  it("names only capabilities a declared specialist already holds", () => {
    expect(skillCapabilitiesWithinWorkforce()).toEqual([]);
  });

  it("names only capabilities that exist in the live registry", () => {
    const index = liveIndex();
    for (const s of AGENT_SKILLS) {
      for (const capability of s.capabilities) {
        expect(index.registered.has(capability), `${s.code} names ${capability}`).toBe(true);
      }
    }
  });

  it("holds no posting capability, directly or by name", () => {
    const workforceHeld = new Set(HIVE_WORKFORCE_PROFILES.flatMap((p) => [...p.capabilities]));
    for (const s of AGENT_SKILLS) {
      for (const capability of s.capabilities) {
        expect(workforceHeld.has(capability)).toBe(true);
        expect(capability).not.toMatch(/post|write|approve|execute/i);
      }
    }
  });

  it("rejects a skill that invents a capability", () => {
    const index = liveIndex();
    const rogue = skill({ capabilities: ["capability.that.does.not.exist"] });
    expect(rogue.capabilities.every((c) => !index.registered.has(c))).toBe(true);
  });
});

describe("Lifecycle order is enforced, not merely declared", () => {
  it("rejects SHIP complete while BUILD is untouched", () => {
    let s = skill();
    s = withStage(s, "SHIP", { state: "COMPLETE" });
    expect(() => assertSkillLifecycleOrder(s)).toThrow(/BUILD|earlier stage/);
  });

  it("rejects TEST complete while SPECIFY is NOT_STARTED", () => {
    let s = skill();
    s = withStage(s, "TEST", { state: "COMPLETE" });
    expect(() => assertSkillLifecycleOrder(s)).toThrow(/SPECIFY/);
  });

  it("accepts a strictly forward-complete prefix", () => {
    let s = skill();
    for (const stage of ["SPECIFY", "PLAN", "BUILD"] as const) {
      s = withStage(s, stage, { state: "COMPLETE" });
    }
    expect(() => assertSkillLifecycleOrder(s)).not.toThrow();
    expect(furthestCompleteStage(s)).toBe("BUILD");
  });

  it("requires a reason for a BLOCKED stage", () => {
    // A block without a stated reason is indistinguishable from neglect.
    const s = withStage(skill(), "TEST", { state: "BLOCKED", blockedReason: null });
    expect(() => assertSkillLifecycleOrder(s)).toThrow(/BLOCKED without a reason/);
  });

  it("accepts BLOCKED with a reason, and does not treat it as complete", () => {
    const s = withStage(skill(), "TEST", { state: "BLOCKED", blockedReason: "runtime absent" });
    expect(() => assertSkillLifecycleOrder(s)).not.toThrow();
    expect(furthestCompleteStage(s)).toBe(null);
  });

  it("the real catalogue satisfies the order guard", () => {
    for (const s of AGENT_SKILLS) {
      expect(() => assertSkillLifecycleOrder(s), s.code).not.toThrow();
    }
  });
});

describe("The human gate is a stop, not a completion", () => {
  it("never marks a skill as past the gate", () => {
    // SHIP means "a human may now decide". No skill is ever reported as merged,
    // deployed or released, because agents do not do those things.
    for (const s of AGENT_SKILLS) {
      const ship = s.lifecycle.find((r) => r.stage === "SHIP");
      expect(ship?.state, s.code).not.toBe("COMPLETE");
    }
  });

  it("marks every skill at the gate as blocked on human review, with a reason", () => {
    for (const s of AGENT_SKILLS.filter((x) => x.readyForHumanGate)) {
      const ship = s.lifecycle.find((r) => r.stage === "SHIP");
      expect(ship?.state, s.code).toBe("BLOCKED");
      expect(ship?.blockedReason, s.code).toMatch(/human|merge/i);
    }
  });

  it("refuses readiness claimed without reaching SHIP", () => {
    // A skill that says it is ready for the gate while SHIP was never started.
    const s = { ...skill(), readyForHumanGate: true };
    expect(() => assertSkillRegistryIntegrity(liveIndex(), [s])).toThrow(/human gate without reaching SHIP/);
  });
});

describe("Registry summary reports the honest stage", () => {
  it("derives one row per skill", () => {
    const rows = skillRegistrySummary();
    expect(rows).toHaveLength(AGENT_SKILLS.length);
    expect(rows.map((r) => r.code).sort()).toEqual(AGENT_SKILLS.map((s) => s.code).sort());
  });

  it("does not report a blocked skill as ready", () => {
    // LOCAL_INFERENCE_VERIFICATION is blocked at TEST — no runtime exists.
    const row = skillRegistrySummary().find((r) => r.code === "LOCAL_INFERENCE_VERIFICATION");
    expect(row).toBeDefined();
    expect(row?.blockedStages).toContain("TEST");
    expect(row?.reached).not.toBe("SHIP");
    expect(row?.atHumanGate).toBe(false);
  });

  it("records the local-inference blocker in words, not as a bare status", () => {
    const s = AGENT_SKILLS.find((x) => x.code === "LOCAL_INFERENCE_VERIFICATION");
    const test = s?.lifecycle.find((r) => r.stage === "TEST");
    expect(test?.state).toBe("BLOCKED");
    expect(test?.blockedReason).toMatch(/ollama|runtime|model/i);
  });

  it("lists the blocked stages for every skill that has one", () => {
    for (const row of skillRegistrySummary()) {
      const skillDef = AGENT_SKILLS.find((s) => s.code === row.code);
      const expected = skillDef?.lifecycle.filter((r) => r.state === "BLOCKED").map((r) => r.stage) ?? [];
      expect(row.blockedStages, row.code).toEqual(expected);
    }
  });

  it("atHumanGate is true only when the last pre-gate stage is complete", () => {
    for (const row of skillRegistrySummary()) {
      if (row.atHumanGate) {
        expect(row.reached).toBe("SIMPLIFY");
        expect(row.blockedStages).toEqual(["SHIP"]);
      }
    }
  });
});
