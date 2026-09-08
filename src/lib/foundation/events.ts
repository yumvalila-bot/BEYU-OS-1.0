/**
 * BEYU Foundation OS — canonical event vocabulary.
 *
 * Events are published to the enterprise `enterprise_events` ledger via
 * lib/audit publishEventTx; Foundation OS introduces no parallel event store.
 */
import { publishEventTx, type Tx } from "@/lib/audit";

export const FOUNDATION_EVENTS = {
  FOUNDATION_REGISTERED: "FOUNDATION_REGISTERED",
  FOUNDATION_STATUS_CHANGED: "FOUNDATION_STATUS_CHANGED",
  FORMATION_CASE_OPENED: "FORMATION_CASE_OPENED",
  FORMATION_ASSESSED: "FORMATION_ASSESSED",
  STRUCTURE_PROPOSAL_CREATED: "STRUCTURE_PROPOSAL_CREATED",
  STRUCTURE_SIMULATED: "STRUCTURE_SIMULATED",
  BOARD_MEMBER_APPOINTED: "BOARD_MEMBER_APPOINTED",
  BOARD_MEMBER_REMOVED: "BOARD_MEMBER_REMOVED",
  MEETING_SCHEDULED: "MEETING_SCHEDULED",
  CONFLICT_DECLARED: "CONFLICT_DECLARED",
  TAX_STATUS_CHANGED: "TAX_STATUS_CHANGED",
  TAX_RULE_PUBLISHED: "TAX_RULE_PUBLISHED",
  OBLIGATION_CREATED: "OBLIGATION_CREATED",
  DEADLINE_COMPUTED: "DEADLINE_COMPUTED",
  DEADLINE_APPROACHING: "DEADLINE_APPROACHING",
  DEADLINE_MISSED: "DEADLINE_MISSED",
  DEADLINE_COMPLETED: "DEADLINE_COMPLETED",
  ESCALATION_RAISED: "ESCALATION_RAISED",
  REGULATORY_RULE_CHANGED: "REGULATORY_RULE_CHANGED",
  DONOR_REGISTERED: "DONOR_REGISTERED",
  DONATION_RECEIVED: "DONATION_RECEIVED",
  FUND_CREATED: "FUND_CREATED",
  FUND_ALLOCATED: "FUND_ALLOCATED",
  GRANT_CREATED: "GRANT_CREATED",
  GRANT_STATUS_CHANGED: "GRANT_STATUS_CHANGED",
  GRANT_APPROVED: "GRANT_APPROVED",
  GRANT_DISBURSED: "GRANT_DISBURSED",
  GRANT_CLOSED: "GRANT_CLOSED",
  PROGRAM_FUNDED: "PROGRAM_FUNDED",
  SAFEGUARDING_REPORTED: "SAFEGUARDING_REPORTED",
  RISK_ESCALATED: "RISK_ESCALATED",
  LEGAL_REVIEW_REQUIRED: "LEGAL_REVIEW_REQUIRED",
  EVIDENCE_VERIFIED: "EVIDENCE_VERIFIED",
} as const;

export type FoundationEventType = (typeof FOUNDATION_EVENTS)[keyof typeof FOUNDATION_EVENTS];

export async function publishFoundationEvent(
  tx: Tx,
  input: {
    type: FoundationEventType;
    tenantId: string;
    legalEntityId?: string | null;
    subjectType: string;
    subjectId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
    traceId: string;
    classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
  },
): Promise<void> {
  await publishEventTx(tx, {
    type: input.type,
    domain: "FOUNDATION_OS",
    operation: input.type,
    destinationDomain: null,
    source: "FOUNDATION_OS",
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actorUserId ?? null,
    classification: input.classification ?? "CONFIDENTIAL",
    payload: input.payload ?? {},
    traceId: input.traceId,
    correlationId: input.traceId,
    causationId: null,
    authorityContext: null,
    policyVersion: null,
  });
}
