/**
 * BEYU Foundation OS — canonical domain vocabulary.
 *
 * Status strings are stored as TEXT in the database and validated against
 * these catalogues at the service boundary. Adding a status is a conscious
 * act: extend the catalogue AND the transition map, never just one.
 */

export const FOUNDATION_STATUSES = [
  "PROPOSED",
  "FORMATION",
  "REGISTRATION_PENDING",
  "REGISTERED",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "DORMANT",
  "RESTRUCTURING",
  "DISSOLVING",
  "DISSOLVED",
  "ARCHIVED",
] as const;
export type FoundationStatus = (typeof FOUNDATION_STATUSES)[number];

export const GRANT_STATUSES = [
  "OPPORTUNITY",
  "APPLICATION",
  "ELIGIBILITY",
  "DUE_DILIGENCE",
  "ASSESSMENT",
  "SCORING",
  "CONFLICT_CHECK",
  "APPROVAL",
  "AGREEMENT",
  "DISBURSEMENT",
  "MILESTONES",
  "MONITORING",
  "REPORTING",
  "CLOSEOUT",
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const PROCUREMENT_STATUSES = [
  "NEED",
  "BUDGET",
  "PROCUREMENT",
  "DUE_DILIGENCE",
  "QUOTES",
  "EVALUATION",
  "CONFLICT_CHECK",
  "APPROVAL",
  "CONTRACT",
  "DELIVERY",
  "INVOICE",
  "PAYMENT",
  "AUDIT",
] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

export const ASSET_STATUSES = [
  "ACQUIRE",
  "REGISTER",
  "REGISTERED",
  "USE",
  "MAINTAIN",
  "TRANSFER",
  "DISPOSE",
  "DISPOSED",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const TAX_STATUSES = [
  "ELIGIBLE",
  "POTENTIALLY_ELIGIBLE",
  "UNDER_REVIEW",
  "CONFIRMED",
  "NOT_ELIGIBLE",
  "EXPIRED",
  "REQUIRES_PROFESSIONAL_REVIEW",
] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const DEADLINE_STATUSES = [
  "UPCOMING",
  "DUE_TODAY",
  "OVERDUE",
  "SUBMITTED",
  "VERIFIED",
  "COMPLETED",
  "WAIVED",
] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "VERIFIED", "COMPLETED", "OVERDUE"] as const;
export type ComplianceTaskStatus = (typeof TASK_STATUSES)[number];

export const NOTIFICATION_DELIVERY = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "ACKNOWLEDGED",
  "FAILED",
  "RETRIED",
  "ESCALATED",
] as const;
export type NotificationDelivery = (typeof NOTIFICATION_DELIVERY)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "PUSH", "SMS", "CALENDAR", "WEBHOOK"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Canonical reminder ladder: days before due date. 0 = due date itself. */
export const DEFAULT_REMINDER_SCHEDULE = [90, 60, 30, 14, 7, 3, 1, 0] as const;

/** Escalation hierarchy, lowest → highest. */
export const ESCALATION_LADDER = [
  "FOUNDATION_OFFICER",
  "FOUNDATION_DIRECTOR",
  "CHIEF_RISK_COMPLIANCE",
  "GROUP_CEO",
  "BOARD",
] as const;
export type EscalationRole = (typeof ESCALATION_LADDER)[number];

export const FORMATION_STATUSES = [
  "INTAKE",
  "FEASIBILITY",
  "STRUCTURE_REVIEW",
  "JURISDICTION_REVIEW",
  "LEGAL_REVIEW",
  "TAX_REVIEW",
  "GOVERNANCE_REVIEW",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type FormationStatus = (typeof FORMATION_STATUSES)[number];

export const SAFEGUARDING_STATUSES = ["REPORTED", "TRIAGED", "INVESTIGATING", "ACTIONED", "CLOSED"] as const;
export type SafeguardingStatus = (typeof SAFEGUARDING_STATUSES)[number];

export const FUND_TYPES = ["RESTRICTED", "UNRESTRICTED", "DESIGNATED", "ENDOWMENT", "RESERVE"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const IMPACT_LEVELS = ["INPUT", "ACTIVITY", "OUTPUT", "OUTCOME", "IMPACT"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const ASSIGNMENT_TYPES = [
  "FOUNDATION",
  "PROGRAM",
  "PROJECT",
  "GRANT",
  "COMPLIANCE",
  "SAFEGUARDING",
  "BOARD",
  "FIELD",
] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const DUE_DILIGENCE = ["NONE", "PENDING", "CLEARED", "FLAGGED", "BLOCKED"] as const;
export type DueDiligenceStatus = (typeof DUE_DILIGENCE)[number];
