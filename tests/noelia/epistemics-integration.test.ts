/**
 * ITERATION 10 — EPISTEMICS (database level)
 *
 * Adversarial scenarios against the real database:
 *  - stale tax authority is excluded and the exclusion is made visible
 *  - rejected (non-authoritative) tax positions are never presented
 *  - treasury provenance is canonical (Finance OS, OBSERVED)
 *  - the full Noelia facade persists the uncertainty block with the answer
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import { aiDecisions, taxStrategies } from "../../src/db/schema";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { askNoelia } from "../../src/lib/noelia";
import { BeyuNoeliaReadService } from "../../src/lib/noelia/read-services";
import { resolveNoeliaAuthorizedScope, requestedNoeliaTarget } from "../../src/lib/noelia/scope-service";
import type { ToolInvocationContext } from "../../src/lib/noelia/types";
import { seededPrincipal } from "./db-fixtures";

const CODES = ["EPI-TAX-CURRENT-01", "EPI-TAX-STALE-01", "EPI-TAX-REJECTED-01"];
const AS_OF = "2026-08-25";

async function cleanup() {
  await db.delete(taxStrategies).where(inArray(taxStrategies.code, CODES));
}

function strategy(code: string, over: Partial<typeof taxStrategies.$inferInsert>) {
  return {
    id: `EPI-TAX-${code}`,
    code,
    title: `Epistemics probe ${code}`,
    jurisdictionCode: "TZ",
    category: "TEST",
    position: "LEGAL_TAX_PLANNING" as const,
    legalBasis: "Tax Administration Act 2015",
    statutoryReference: "TAA 2015 s.1",
    economicBenefitBasis: "test",
    taxEffect: "test",
    cashflowEffect: "test",
    accountingEffect: "test",
    complianceRisk: 1,
    auditRisk: 1,
    legalRisk: 1,
    reputationalRisk: 1,
    provenanceSource: "test-fixture",
    authorityStatus: "AUTHORITATIVE" as const,
    effectiveFrom: "2024-07-01",
    effectiveTo: null,
    reviewDate: "2026-12-31",
    ...over,
  };
}

beforeAll(async () => {
  await cleanup();
  await db.insert(taxStrategies).values([
    strategy("EPI-TAX-CURRENT-01", {}),
    strategy("EPI-TAX-STALE-01", { reviewDate: "2026-06-30" }),
    strategy("EPI-TAX-REJECTED-01", { authorityStatus: "REJECTED" }),
  ]);
});

afterAll(async () => {
  await cleanup();
});

async function taxContext() {
  const principal = await seededPrincipal("cfo@beyu.os");
  if (!principal.permissions.has("finance:tax.read")) {
    throw new Error("Test premise broken: CFO principal lacks finance:tax.read");
  }
  // Scope resolution itself requires the canonical transaction context.
  const scope = await withTenantDatabaseContext(principal, () => resolveNoeliaAuthorizedScope(principal));
  if (!scope.countryCodes.includes("TZ")) {
    throw new Error("Test premise broken: CFO scope does not cover TZ");
  }
  const context: ToolInvocationContext = {
    principal,
    traceId: "TRACE_EPI_INT",
    target: requestedNoeliaTarget(principal, null),
    scope,
    approval: null,
  };
  return { principal, context };
}

describe("epistemics against the canonical database", () => {
  it("excludes stale and rejected tax positions and makes the exclusion visible", async () => {
    const { principal, context } = await taxContext();
    await withTenantDatabaseContext(principal, async () => {
      const output = await new BeyuNoeliaReadService().tax(context);
      expect(output.sources?.map((s) => s.ref)).toEqual(["EPI-TAX-CURRENT-01"]);
      expect(output.sources?.[0]).toMatchObject({
        authority: "AUTHORITATIVE",
        epistemicClass: "OBSERVED",
        reviewDate: "2026-12-31",
      });
      // stale ≠ current and unverified ≠ authoritative: at least our 2 stale
      // / rejected fixtures are excluded (seeded strategies may add more).
      expect(output.narrative).toBeTruthy();
      const excludedMatch = output.narrative?.match(/(\d+) position\(s\) were excluded/);
      expect(excludedMatch).toBeTruthy();
      expect(Number(excludedMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(2);
      expect(output.narrative).toContain("stale ≠ current");
      // Tax intelligence always routes to human review.
      expect(output.humanReviewRequired).toBe(true);
    });
  });

  it("anchors treasury provenance in the canonical Finance OS table", async () => {
    const { principal, context } = await taxContext();
    await withTenantDatabaseContext(principal, async () => {
      const output = await new BeyuNoeliaReadService().treasury(context);
      expect(output.sources?.[0]).toMatchObject({
        kind: "FINANCE_OS",
        authority: "FINANCE_OS",
        epistemicClass: "OBSERVED",
        authorityStatus: "AUTHORITATIVE",
      });
      expect(output.findings?.length).toBeGreaterThan(0);
      // The aggregate is explicitly scoped — never a silent "missing = zero".
      expect(output.findings?.[0].value).toMatch(/account\(s\)/);
    });
  });

  it("persists the uncertainty block with the AI decision (full facade path)", async () => {
    const principal = await seededPrincipal("cfo@beyu.os");
    const answer = await askNoelia({
      principal,
      question: "Which risks exceed appetite? EPI-INT",
      traceId: "TRACE_EPI_FACADE",
    });

    expect(["FACT", "INFERENCE", "RECOMMENDATION", "PREDICTION", "UNCERTAINTY", "REQUIRES_HUMAN_REVIEW"]).toContain(
      answer.outputClass,
    );
    expect(answer.confidence).toBeLessThanOrEqual(answer.uncertainty.confidenceCap);
    expect(answer.uncertainty.classification).toBeTruthy();

    const [decision] = await db.select().from(aiDecisions).where(eq(aiDecisions.id, answer.decisionId));
    expect(decision).toBeTruthy();
    const output = decision.output as { uncertainty?: { classification?: string } };
    expect(output.uncertainty?.classification).toBe(answer.uncertainty.classification);
  });
});
