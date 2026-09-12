/**
 * BEYU OS — Family Office protection & insurance: canonical event vocabulary.
 *
 * Events are published to the EXISTING enterprise `enterprise_events` ledger
 * through `lib/audit` `publishEventTx` — this domain introduces no parallel
 * event store. The names below are the §18 set: creation, update, beneficiary,
 * premium, review, claim and proceeds facts. `INSURANCE_PREMIUM_DUE` is
 * deliberately NOT an emitted event: due-ness is derived deterministically at
 * read time from recorded rows (`premiums.effectivePremiumStatus`), and a
 * scheduler that "announced" it would be this module acting on its own record
 * set (§14: no automatic policy modification).
 */

export const FAMILY_OFFICE_PROTECTION_EVENTS = {
  INSURANCE_POLICY_CREATED: "INSURANCE_POLICY_CREATED",
  INSURANCE_POLICY_UPDATED: "INSURANCE_POLICY_UPDATED",
  INSURANCE_POLICY_STATUS_CHANGED: "INSURANCE_POLICY_STATUS_CHANGED",
  INSURANCE_POLICY_TERMINATED: "INSURANCE_POLICY_TERMINATED",
  INSURANCE_GOVERNANCE_STAGE_ADVANCED: "INSURANCE_GOVERNANCE_STAGE_ADVANCED",
  INSURANCE_BENEFICIARY_CHANGED: "INSURANCE_BENEFICIARY_CHANGED",
  INSURANCE_PREMIUM_RECORDED: "INSURANCE_PREMIUM_RECORDED",
  INSURANCE_ASSIGNMENT_RECORDED: "INSURANCE_ASSIGNMENT_RECORDED",
  INSURANCE_POLICY_LOAN_RECORDED: "INSURANCE_POLICY_LOAN_RECORDED",
  INSURANCE_REVIEW_COMPLETED: "INSURANCE_REVIEW_COMPLETED",
  INSURANCE_CLAIM_OPENED: "INSURANCE_CLAIM_OPENED",
  INSURANCE_CLAIM_UPDATED: "INSURANCE_CLAIM_UPDATED",
  INSURANCE_CLAIM_APPROVED: "INSURANCE_CLAIM_APPROVED",
  INSURANCE_PROCEEDS_RECEIVED: "INSURANCE_PROCEEDS_RECEIVED",
  INSURANCE_PROCEEDS_ALLOCATED: "INSURANCE_PROCEEDS_ALLOCATED",
  INSURANCE_PROTECTION_ASSESSED: "INSURANCE_PROTECTION_ASSESSED",
} as const;

export type FamilyOfficeProtectionEventType =
  (typeof FAMILY_OFFICE_PROTECTION_EVENTS)[keyof typeof FAMILY_OFFICE_PROTECTION_EVENTS];

/** The event stream's canonical domain name — Family Office is a BEYU OS capability. */
export const FAMILY_OFFICE_PROTECTION_EVENT_DOMAIN = "FAMILY_OFFICE";
