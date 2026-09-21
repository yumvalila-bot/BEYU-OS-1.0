import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceEvaluations } from "@/db/schema";
import {
  conductBoardEvaluation,
  listBoardEvaluations,
} from "@/lib/governance/evaluation-service";
import { appointmentFixture, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";

describe("Governed Board & Committee Evaluations", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;

  beforeAll(async () => {
    f = await appointmentFixture("EVAL_TEST");
  });

  afterAll(async () => {
    await db.delete(governanceEvaluations).where(eq(governanceEvaluations.bodyId, f.bodyId));
    await cleanupAppointments("EVAL_TEST");
  });

  it("conducts annual board effectiveness evaluation with dimension scores and recommendations", async () => {
    const evaluation = await as(f.chair, () =>
      conductBoardEvaluation(f.chair, f.bodyId, {
        evaluationType: "ANNUAL_BOARD_EFFECTIVENESS",
        evaluationPeriod: "FY2026",
        dimensionScores: {
          STRATEGIC_ALIGNMENT: 4.8,
          GOVERNANCE_INTEGRITY: 5.0,
          RISK_INTERNAL_CONTROLS: 4.5,
          MEETING_DILIGENCE: 4.2,
          STAKEHOLDER_TRANSPARENCY: 4.6,
          SUCCESSION_READINESS: 4.0,
        },
        findings: [
          "Quorum and attendance diligence met 100% of charter requirements",
          "Risk committee established strong capital posting isolation",
        ],
        recommendations: [
          "Conduct advanced crisis communication module for presiding succession candidates",
          "Deepen sector-specific audit training for audit committee members",
        ],
      }),
    );

    expect(evaluation.id).toMatch(/^GEV_/);
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(80);
    expect(evaluation.status).toBe("COMPLETED");
    expect(evaluation.findings.length).toBe(2);

    const list = await as(f.chair, () => listBoardEvaluations(f.chair, f.bodyId));
    expect(list.some((e) => e.id === evaluation.id)).toBe(true);
  });
});
