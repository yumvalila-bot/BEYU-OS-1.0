/**
 * BEYU OS — Family Office: lifecycle / lifestyle management engineering.
 *
 * The lifestyle RAILS: neutral service categories, engagements, requests,
 * and human approvals. Plus the lifecycle observation no-op guarantee
 * (shared with wealth.ts).
 *
 * HARD BOUNDARIES:
 *   - lifestyle categories are STRUCTURAL TAGS (residency, travel,
 *     security, property services, …) — they encode no entitlement;
 *   - a lifestyle request becomes effective only through a HUMAN
 *     approval decision with a proven authority reference (same shape as
 *     governance approvals);
 *   - no cost/amount/fee fields exist in this domain: lifestyle
 *     fulfilment with financial consequence references the Finance OS.
 */

import { familyError } from "../phase3/errors";
import { assertNoFinancialState } from "../phase3/contracts";
import { isIsoDate, type EffectivePeriod } from "./types";

export const LIFESTYLE_CATEGORIES = ["RESIDENCY", "TRAVEL", "HEALTH_WELLNESS", "SECURITY", "PROPERTY_SERVICES", "EDUCATION_SERVICES", "LEGAL_SUPPORT", "OTHER"] as const;
export type LifestyleCategory = (typeof LIFESTYLE_CATEGORIES)[number];

export interface LifestyleEngagement {
  engagementRef: string;
  partyRef: string;
  category: LifestyleCategory;
  providerRef: string | null;
  status: "PROPOSED" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  period: EffectivePeriod | null;
  advisorRef: string | null;
  tenantId: string;
}

export function assertLifestyleEngagement(e: LifestyleEngagement): void {
  if (!(LIFESTYLE_CATEGORIES as readonly string[]).includes(e.category)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown lifestyle category "${e.category}".`, []);
  }
  if (e.period !== null && !isIsoDate(e.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Lifestyle engagement period must start at an ISO date.", []);
  }
  assertNoFinancialState(e, "LifestyleEngagement");
}

export interface LifestyleRequest {
  requestRef: string;
  partyRef: string;
  category: LifestyleCategory;
  purpose: string;
  requestedBy: string;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED" | "WITHDRAWN";
  approvalRef: string | null;
  /** Present when fulfilment has a financial aspect (Finance OS is the truth). */
  financeReference: string | null;
  tenantId: string;
}

export function assertLifestyleRequest(r: LifestyleRequest): void {
  if (!isIsoDate(r.requestedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Lifestyle request requestedAt must be an ISO date.", []);
  if (!(LIFESTYLE_CATEGORIES as readonly string[]).includes(r.category)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown lifestyle category "${r.category}".`, []);
  }
  if ((r.status === "APPROVED" || r.status === "FULFILLED") && (r.approvalRef === null || r.approvalRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An APPROVED/FULFILLED lifestyle request must carry its approval reference.", []);
  }
  assertNoFinancialState(r, "LifestyleRequest");
}

export interface LifestyleApproval {
  approvalRef: string;
  requestRef: string;
  approverUserId: string;
  decision: "APPROVED" | "REJECTED";
  authorityRef: string;
  decidedAt: string;
  tenantId: string;
}

export function assertLifestyleApproval(a: LifestyleApproval): void {
  if (a.approverUserId.toUpperCase() === "NOELIA" || a.approverUserId.toUpperCase() === "AI") {
    throw familyError("HUMAN_ACTOR_REQUIRED", "A lifestyle approval is a human decision (FIR-017).", []);
  }
  if (typeof a.authorityRef !== "string" || a.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "A lifestyle approval must cite the authority under which it is made.", []);
  }
  if (!isIsoDate(a.decidedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Lifestyle approval decidedAt must be an ISO date.", []);
  assertNoFinancialState(a, "LifestyleApproval");
}
