import { z } from "zod";

export const EVALUATION_TYPES = [
  "ANNUAL_BOARD_EFFECTIVENESS",
  "COMMITTEE_OVERSIGHT_REVIEW",
  "PEER_DIRECTOR_ASSESSMENT",
] as const;
export type EvaluationType = (typeof EVALUATION_TYPES)[number];

export const EVALUATION_DIMENSIONS = [
  "STRATEGIC_ALIGNMENT",
  "GOVERNANCE_INTEGRITY",
  "RISK_INTERNAL_CONTROLS",
  "MEETING_DILIGENCE",
  "STAKEHOLDER_TRANSPARENCY",
  "SUCCESSION_READINESS",
] as const;
export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];

export const ConductEvaluationSchema = z.object({
  evaluationType: z.enum(EVALUATION_TYPES).default("ANNUAL_BOARD_EFFECTIVENESS"),
  evaluationPeriod: z.string().trim().min(4).max(50),
  dimensionScores: z.record(z.enum(EVALUATION_DIMENSIONS), z.number().min(1).max(5)),
  findings: z.array(z.string().trim().min(5).max(1000)).min(1),
  recommendations: z.array(z.string().trim().min(5).max(1000)).min(1),
  documentId: z.string().min(1).max(100).optional(),
}).strict();
export type ConductEvaluationInput = z.input<typeof ConductEvaluationSchema>;
export type ParsedConductEvaluationInput = z.infer<typeof ConductEvaluationSchema>;
