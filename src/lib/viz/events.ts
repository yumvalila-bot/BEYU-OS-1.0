/**
 * BEYU OS — Visualization enterprise-event integration (the EXISTING chain).
 *
 * This module does NOT create a second event system, a shadow audit log or
 * any new persistence: viz acts ride the canonical `enterprise_events`
 * pipeline through `withAuditTransaction` / `recordEvent`, exactly like the
 * sector services do. What lives here:
 *
 *   1. The CLOSED vocabulary of viz event types actually emitted by this
 *      capability (grep-verified: these are the only VIZ_* types written).
 *   2. `vizEventInput` — the full EventInput builder (source/domain/envelope
 *      fields mirror the Foundation OS pattern so interop consumers see one
 *      consistent contract).
 *   3. `REFRESH_TRIGGERS` — a VERIFIED mapping from sector event types that
 *      this capability actually listens for to the sectors whose scenes may
 *      need a freshness refresh (UI "data changed — refresh" hints). This is
 *      a staleness HINT only: every refresh re-authorizes and re-reads
 *      through the adapter, so a missed or spoofed hint can never widen
 *      access or serve stale truth as fresh.
 *
 * HONESTY: entries below only list event types that exist in the codebase's
 * emitted vocabulary (verified by grep at implementation time). No plausible
 * but unemitted type appears here.
 */
import type { EventInput } from "@/lib/audit";
import type { Classification } from "@/lib/constants";
import type { VizSectorCode } from "./dimensions";

/** Closed vocabulary — the ONLY VIZ_* types this capability emits. */
export const VIZ_EVENT_TYPES = [
  "VIZ_DIMENSION_REGISTERED",
  "VIZ_SCENE_CREATED",
  "VIZ_SCENE_ARCHIVED",
  "VIZ_TWIN_REGISTERED",
  "VIZ_EXPORT_CREATED",
] as const;

export type VizEventType = (typeof VIZ_EVENT_TYPES)[number];

/** Interop envelope: viz events publish under the shared VISUALIZATION domain. */
export const VIZ_EVENT_SOURCE = "BEYU_OS";
export const VIZ_EVENT_DOMAIN = "VISUALIZATION";

/**
 * Sector-refresh triggers. Keys are event types verified to exist in the
 * emitted vocabulary of each sector; values are the sectors whose saved
 * scenes/twins may want a re-read. The visualization layer consumes these as
 * a REVALIDATE hint — never as a data feed.
 */
export const REFRESH_TRIGGERS: Record<string, VizSectorCode[]> = {
  /* ── UJENZI OS (Sector OS — triggers only; construction truth stays in UJENZI OS) ── */
  PROJECT_CREATED: ["UJENZI"],
  PROJECT_HANDED_OVER: ["UJENZI"],
  SITE_PROGRESS_RECORDED: ["UJENZI"],
  BOQ_APPROVED: ["UJENZI"],
  PROCUREMENT_REQUESTED: ["UJENZI"],
  PURCHASE_ORDER_APPROVED: ["UJENZI"],
  MATERIAL_RECEIVED: ["UJENZI"],
  MATERIAL_ISSUED: ["UJENZI"],
  EQUIPMENT_ASSIGNED: ["UJENZI"],
  QUALITY_INSPECTION_RECORDED: ["UJENZI"],
  NCR_CREATED: ["UJENZI"],
  NCR_CLOSED: ["UJENZI"],
  HSE_INCIDENT_RECORDED: ["UJENZI"],
  VARIATION_APPROVED: ["UJENZI"],
  CLAIM_SUBMITTED: ["UJENZI"],
  PAYMENT_CERTIFIED: ["UJENZI"],

  /* ── Agriculture OS (triggers only; agriculture truth stays in its own OS) ── */
  HARVEST_RECORDED: ["AGRICULTURE"],
  JOURNAL_ENTRY_POSTED: ["FINANCE"], // finance-side postings may move 5D summaries
  WATERFALL_SIMULATED: ["FINANCE"],

  /* ── Foundation (sister nonprofit — triggers only) ── */
  GRANT_APPLICATION_CREATED: ["FOUNDATION"],
  GRANT_APPLICATION_REVIEWED: ["FOUNDATION"],
  GRANT_CREATED: ["FOUNDATION"],
  GRANT_DISBURSED: ["FOUNDATION"],
  GRANT_CLOSED: ["FOUNDATION"],
  DEADLINE_COMPLETED: ["FOUNDATION"],
  GOVERNANCE_RESOLUTION_DECIDED: ["FOUNDATION"],
};

/** Sectors that should offer a freshness revalidation after an event type. */
export function refreshSectorsFor(eventType: string): VizSectorCode[] {
  return REFRESH_TRIGGERS[eventType] ?? [];
}

export type VizEventInputArgs = {
  type: VizEventType;
  operation: string;
  tenantId: string;
  legalEntityId?: string | null;
  subjectType: string;
  subjectId: string;
  actorUserId: string;
  /** The record classification; interop classifications are the same ladder. */
  classification: Classification;
  payload?: Record<string, unknown>;
  traceId: string;
};

/**
 * Full EventInput builder — mirrors the Foundation OS envelope pattern
 * (correlationId = traceId, no causation/authority context on origination)
 * so interop consumers parse viz events with the common contract.
 */
export function vizEventInput(args: VizEventInputArgs): EventInput {
  return {
    type: args.type,
    source: VIZ_EVENT_SOURCE,
    domain: VIZ_EVENT_DOMAIN,
    operation: args.operation,
    destinationDomain: null,
    tenantId: args.tenantId,
    legalEntityId: args.legalEntityId ?? null,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    actorUserId: args.actorUserId,
    actorType: "HUMAN",
    classification: args.classification,
    payload: args.payload ?? {},
    traceId: args.traceId,
    correlationId: args.traceId,
    causationId: null,
    authorityContext: null,
    policyVersion: null,
    eventVersion: "1.0",
    schemaVersion: "1.0",
  };
}
