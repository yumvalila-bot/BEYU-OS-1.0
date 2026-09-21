import { z } from "zod";
import { SEAT_ROLES } from "./charter-contract";

export const COMPETENCY_DOMAINS = [
  "GOVERNANCE_LEADERSHIP",
  "FINANCIAL_AUDIT",
  "LEGAL_REGULATORY",
  "INDUSTRY_SECTOR",
  "RISK_INTERNAL_CONTROLS",
  "TECHNOLOGY_SECURITY",
  "ESG_SUSTAINABILITY",
  "STRATEGY_SCALE",
] as const;
export type CompetencyDomain = (typeof COMPETENCY_DOMAINS)[number];

export const INDEPENDENCE_INDICATORS = [
  "INDEPENDENT_NON_EXECUTIVE",
  "EXECUTIVE_DIRECTOR",
  "SHAREHOLDER_REPRESENTATIVE",
  "FAMILY_TRUST_DESIGNEE",
] as const;
export type IndependenceIndicator = (typeof INDEPENDENCE_INDICATORS)[number];

export const JURISDICTION_SCOPES = ["TZ", "KE", "UG", "RW", "PAN_AFRICAN", "GLOBAL"] as const;
export type JurisdictionScope = (typeof JURISDICTION_SCOPES)[number];

export const SEAT_OCCUPANCY_STATUSES = [
  "OCCUPIED",
  "VACANT",
  "EXPIRING_SOON",
  "SUSPENDED",
  "EXPIRED",
] as const;
export type SeatOccupancyStatus = (typeof SEAT_OCCUPANCY_STATUSES)[number];

export const MemberCompetencyEvidenceSchema = z.object({
  domain: z.enum(COMPETENCY_DOMAINS),
  proficiencyLevel: z.enum(["EXPERT", "PROFICIENT", "WORKING_KNOWLEDGE"]),
  documentId: z.string().min(1).max(100),
  documentVersion: z.string().min(1).max(20),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  verifiedByUserId: z.string().min(1).max(100),
  notes: z.string().trim().max(1000).optional(),
}).strict();
export type MemberCompetencyEvidence = z.infer<typeof MemberCompetencyEvidenceSchema>;

export const SeatDefinitionSchema = z.object({
  seatRole: z.enum(SEAT_ROLES),
  votingRights: z.boolean(),
  independenceRequirement: z.enum(INDEPENDENCE_INDICATORS),
  requiredCompetencies: z.array(z.enum(COMPETENCY_DOMAINS)).min(1),
  geographicRequirement: z.enum(JURISDICTION_SCOPES).default("TZ"),
  maximumTenureMonths: z.number().int().positive().default(72), // 6-year default standard
}).strict();
export type SeatDefinition = z.infer<typeof SeatDefinitionSchema>;

export const SuccessionPlanSchema = z.object({
  targetSeatRole: z.enum(SEAT_ROLES),
  primaryCandidatePartyId: z.string().min(1).max(100).optional(),
  backupCandidatePartyId: z.string().min(1).max(100).optional(),
  readinessTimeline: z.enum(["EMERGENCY_READY", "SHORT_TERM_6M", "MEDIUM_TERM_18M", "LONG_TERM_36M"]),
  developmentRequirements: z.array(z.string().trim().min(5).max(500)).default([]),
  trainingModules: z.array(z.string().trim().min(5).max(500)).default([]),
  notes: z.string().trim().max(2000).optional(),
}).strict();
export type SuccessionPlan = z.infer<typeof SuccessionPlanSchema>;

export const BoardCompositionAnalysisSchema = z.object({
  bodyId: z.string(),
  bodyCode: z.string(),
  asOfDate: z.string(),
  totalSeats: z.number().int().nonnegative(),
  activeMembers: z.number().int().nonnegative(),
  votingMembers: z.number().int().nonnegative(),
  vacancies: z.number().int().nonnegative(),
  expiringWithin90Days: z.number().int().nonnegative(),
  independenceRatio: z.number().min(0).max(1),
  competencyCoverageRatio: z.number().min(0).max(1),
  domainCoverage: z.record(z.enum(COMPETENCY_DOMAINS), z.number().int().nonnegative()),
  competencyGaps: z.array(z.enum(COMPETENCY_DOMAINS)),
  compositionSatisfied: z.boolean(),
  violations: z.array(z.string()),
  successionReadiness: z.array(SuccessionPlanSchema),
}).strict();
export type BoardCompositionAnalysis = z.infer<typeof BoardCompositionAnalysisSchema>;
