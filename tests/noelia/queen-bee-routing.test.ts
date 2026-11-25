/**
 * NOELIA — Queen Bee routing acceptance.
 *
 * These are the PHASE 4 acceptance scenarios, written as executable contracts.
 * They test the ACTUAL routing behaviour of the canonical eight-brain core, not
 * a reimplementation of it.
 *
 * The defect this file was written against: attribution matched a fixed list of
 * institutional keywords and unconditionally added KNOWLEDGE. A plainly phrased
 * clinical question ("my patient has a persistent fever") therefore reached the
 * Knowledge brain ALONE. It could not convene a specialist because no keyword
 * on the list appeared in the sentence — the router had no concept of a domain.
 *
 * What is asserted here:
 *   1. Plain-language clinical prompts reach the clinical domain AND convene a
 *      specialist beyond the evidence floor.
 *   2. Plain-language financial prompts reach the financial domain, and a
 *      financial question carrying institutional consequence also convenes the
 *      Institutional brain.
 *   3. Cross-domain questions convene multiple domains and are marked as such.
 *   4. Ambiguous questions route to the evidence floor only, with LOW
 *      confidence, so a caller can disclose uncertainty or ask a human.
 *   5. Every convened brain is one of the eight canonical brains. No test here
 *      would pass by inventing a ninth.
 *   6. Routing never widens authority: plan nodes still name only capabilities
 *      the caller is already authorized to invoke.
 */
import { describe, expect, it } from "vitest";
import { NOELIA_BRAIN_IDS, NOELIA_BRAINS, type NoeliaBrainId } from "@/lib/noelia/cognitive/brain-contracts";
import {
  attributeBrains,
  attributeBrainsDetailed,
  planQueenBeeWork,
} from "@/lib/noelia/cognitive/queen-bee";

const ALL_AUTHORIZED = [
  "knowledge.rag.search",
  "noelia.knowledge_graph.query",
  "noelia.decision_memory.query",
  "noelia.world_model.query",
  "analytics.run",
  "finance.cash.position",
  "finance.treasury.aggregate",
  "governance.resolution.query",
  "governance.strategic.objectives",
  "noelia.operations.status",
  "noelia.scenario.simulate",
];

describe("Queen Bee — domain sensing", () => {
  it("routes a plainly phrased clinical question beyond the evidence floor", () => {
    // The exact failure mode from the audit: no clinical jargon at all.
    const detail = attributeBrainsDetailed("My patient has a persistent fever and I am unsure about the diagnosis.");
    expect(detail.domains).toContain("CLINICAL");
    expect(detail.brains).toContain("KNOWLEDGE");
    expect(detail.brains).toContain("ANALYTICAL");
    expect(detail.brains.length).toBeGreaterThan(1);
  });

  it("recognises lay ward language without clinical vocabulary", () => {
    const detail = attributeBrainsDetailed(
      "One of our nurses says a child on the ward is unwell with a rash. What should we consider?",
    );
    expect(detail.domains).toContain("CLINICAL");
    expect(detail.brains).toContain("ANALYTICAL");
  });

  it("routes a plainly phrased financial question to the financial domain", () => {
    const detail = attributeBrainsDetailed("Will we run short of cash next quarter if revenue stays flat?");
    expect(detail.domains).toContain("FINANCIAL");
    expect(detail.brains).toContain("ANALYTICAL");
  });

  it("convenes the Institutional brain when money carries governance consequence", () => {
    // A treasury decision is not a spreadsheet question — approval rides with it.
    const detail = attributeBrainsDetailed(
      "Should the board approve the treasury reallocation to fund the new capital budget?",
    );
    expect(detail.domains).toContain("FINANCIAL");
    expect(detail.brains).toContain("INSTITUTIONAL");
    expect(detail.brains).toContain("ANALYTICAL");
  });

  it("senses governance, legal, operational and workforce domains", () => {
    expect(attributeBrainsDetailed("What does the constitution require for a board resolution?").domains).toContain(
      "GOVERNANCE",
    );
    expect(
      attributeBrainsDetailed("Does this contract clause create liability if we breach the permit conditions?")
        .domains,
    ).toContain("LEGAL");
    expect(attributeBrainsDetailed("The workflow pipeline has a backlog and deployment is blocked.").domains).toContain(
      "OPERATIONAL",
    );
    expect(
      attributeBrainsDetailed("Our headcount attrition is rising; should we recruit or train existing staff?").domains,
    ).toContain("WORKFORCE");
  });

  it("marks a cross-domain question and convenes several brains", () => {
    const detail = attributeBrainsDetailed(
      "Our ward is unwell - will the clinical capacity cost blow the capital budget, and does the board need to approve it?",
    );
    expect(detail.multiDomain).toBe(true);
    expect(detail.domains.length).toBeGreaterThan(1);
    expect(detail.brains.length).toBeGreaterThanOrEqual(3);
    expect(detail.domains).toContain("CLINICAL");
    expect(detail.domains).toContain("FINANCIAL");
    expect(detail.domains).toContain("GOVERNANCE");
  });

  it("reports LOW confidence for an unroutable question instead of guessing", () => {
    const detail = attributeBrainsDetailed("hello");
    expect(detail.brains).toEqual(["KNOWLEDGE"]);
    expect(detail.domains).toEqual([]);
    // Below any sensible threshold, so a caller is expected to ask or escalate.
    expect(detail.confidence).toBeLessThan(0.2);
    expect(detail.explanation).toMatch(/clarification/i);
  });

  it("never exceeds the canonical eight brains and never invents one", () => {
    const probes = [
      "My patient has a persistent fever",
      "Should the board approve the treasury reallocation?",
      "Does this contract clause create liability?",
      "Our headcount attrition is rising",
      "hello",
      "",
    ];
    for (const probe of probes) {
      for (const brain of attributeBrains(probe)) {
        expect(NOELIA_BRAIN_IDS).toContain(brain);
      }
    }
    // The contract itself is still exactly eight.
    expect(NOELIA_BRAINS.length).toBe(8);
  });

  it("is deterministic — the same question always routes the same way", () => {
    const q = "Should the board approve the treasury reallocation to fund the capital budget?";
    const a = attributeBrainsDetailed(q);
    const b = attributeBrainsDetailed(q);
    expect(a.brains).toEqual(b.brains);
    expect(a.domains).toEqual(b.domains);
    expect(a.confidence).toBe(b.confidence);
  });

  it("records an inspectable reason for every convened brain", () => {
    const detail = attributeBrainsDetailed("My patient has a fever and the treasury budget is short.");
    for (const brain of detail.brains) {
      expect(detail.reasons.some((r) => r.brain === brain)).toBe(true);
    }
  });

  it("returns brains in canonical ordinal order, not match order", () => {
    const detail = attributeBrainsDetailed(
      "The board resolution must approve the clinical budget variance forecast.",
    );
    const ordinals = detail.brains.map((id) => NOELIA_BRAINS.find((b) => b.id === id)!.ordinal);
    expect(ordinals).toEqual([...ordinals].sort((x, y) => x - y));
  });
});

describe("Queen Bee — authorization is never widened by better routing", () => {
  it("plan nodes name only capabilities the caller already holds", () => {
    const authorized = ["knowledge.rag.search"];
    const result = planQueenBeeWork({
      question: "My patient has a persistent fever — what does the board resolution require for the budget?",
      authorizedCapabilities: authorized,
      planId: "PLAN_AUTH_1",
    });
    for (const node of result.plan.nodes) {
      for (const capability of node.capabilities) {
        expect(authorized).toContain(capability);
      }
    }
  });

  it("surfaces the denial when a convened brain has no authorized reach", () => {
    // Routing to ANALYTICAL must not conjure an analytics capability the caller
    // does not have. The denial must be VISIBLE, never silently dropped.
    const result = planQueenBeeWork({
      question: "My patient has a persistent fever and I need an analysis of the treatment options.",
      authorizedCapabilities: ["knowledge.rag.search"],
      planId: "PLAN_AUTH_2",
    });
    const analytical = result.brains.find((b) => b.brain === "ANALYTICAL");
    expect(analytical).toBeDefined();
    expect(analytical!.authorizedReach).toEqual([]);
    expect(analytical!.denied.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(true);
  });

  it("a fully authorized caller gets an undegraded plan for a cross-domain question", () => {
    const result = planQueenBeeWork({
      question: "Our ward is unwell and the clinical cost will hit the capital budget the board must approve.",
      authorizedCapabilities: ALL_AUTHORIZED,
      planId: "PLAN_AUTH_3",
    });
    expect(result.degraded).toBe(false);
    expect(result.brains.length).toBeGreaterThanOrEqual(3);
    for (const entry of result.brains) {
      expect(entry.authorizedReach.length).toBeGreaterThan(0);
    }
  });

  it("every plan node's brain is canonical", () => {
    const result = planQueenBeeWork({
      question: "Should the board approve the treasury reallocation to fund the capital budget?",
      authorizedCapabilities: ALL_AUTHORIZED,
      planId: "PLAN_AUTH_4",
    });
    for (const node of result.plan.nodes) {
      expect(NOELIA_BRAIN_IDS).toContain(node.brain as NoeliaBrainId);
    }
  });
});
