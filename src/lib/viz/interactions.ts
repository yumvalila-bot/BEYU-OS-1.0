/**
 * BEYU OS — HOLOGRAPH GOVERNED INTERACTIONS (shared capability, migration 0067).
 *
 * The governed spatial interaction model. A user gesture in the Holograph
 * surface becomes a server-authorized interaction REQUEST:
 *
 *   gesture → Holograph Interaction API → Identity → RBAC/ABAC → Policy →
 *   Tenant/Entity/Country → Permission → RLS → ledgered result
 *   (presentation | navigation | delegation to an existing governed workflow)
 *
 * NEVER: gesture → direct database mutation.
 *
 * INTERACTION CLASSES
 * ────────────────────
 *   PRESENTATION — SELECT_OBJECT, INSPECT_OBJECT, FOCUS_OBJECT, FILTER_LAYER,
 *     NAVIGATE_SCENE, QUERY_SPATIAL_DATA, VIEW_EVENT, VIEW_AUDIT_CONTEXT.
 *     The data these present was ALREADY served through the governed manifest;
 *     the ledger records the request + authorization result. No new data is
 *     fetched, no sector record is touched.
 *   NAVIGATION   — OPEN_ENTITY, OPEN_DOCUMENT. Records intent toward an
 *     existing governed surface; that surface re-runs its OWN boundary on
 *     arrival. An interaction never grants what the target surface withholds.
 *   DELEGATION   — REQUEST_WORKFLOW, REQUEST_APPROVAL. The ledger records a
 *     DELEGATED request with its target domain and reference. It creates NO
 *     workflow state and executes NOTHING: the target's governed workflow
 *     engine owns approval, posting and execution (Holograph → REQUEST →
 *     Governance/Workflow → required approvals → authoritative system →
 *     audit). CAP_POSTING remains LOCKED; no interaction path reaches a
 *     journal, treasury or posting engine.
 *
 * DENIALS ARE FIRST-CLASS. Every request — including every denial — writes a
 * viz_interactions row plus an audit record plus an enterprise event (the
 * EXISTING chain, atomically).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { can } from "@/lib/authz";
import type { Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import { getScene, getTwinRegistration } from "./service";
import { assertSectorAccess, entityScopeRefusal } from "./authorization";
import { VIZ_SECTOR_CODES, type VizSectorCode } from "./dimensions";
import { VizDomainError } from "./errors";
import { vizEventInput } from "./events";
import { VIZ_INTERACTION_TARGET_DOMAINS, VIZ_INTERACTION_TYPES } from "@/db/schema/visualization";
import type { VizActor } from "./service";

export type InteractionType = (typeof VIZ_INTERACTION_TYPES)[number];
export type InteractionOutcome = "ALLOWED" | "DENIED" | "DELEGATED";
export type InteractionTargetDomain = (typeof VIZ_INTERACTION_TARGET_DOMAINS)[number];

const PRESENTATION_TYPES: InteractionType[] = [
  "SELECT_OBJECT",
  "INSPECT_OBJECT",
  "FOCUS_OBJECT",
  "FILTER_LAYER",
  "NAVIGATE_SCENE",
  "QUERY_SPATIAL_DATA",
  "VIEW_EVENT",
  "VIEW_AUDIT_CONTEXT",
];
const NAVIGATION_TYPES: InteractionType[] = ["OPEN_ENTITY", "OPEN_DOCUMENT"];
const DELEGATION_TYPES: InteractionType[] = ["REQUEST_WORKFLOW", "REQUEST_APPROVAL"];

/** Navigation/delegation types carry an extra target-surface permission: the
 * interaction may only RECORD intent toward a surface the principal can
 * actually enter — it must never advertise a door the principal cannot open. */
const TARGET_SURFACE_PERMISSION: Partial<Record<InteractionType, string>> = {
  OPEN_ENTITY: "organization:entity.read",
  OPEN_DOCUMENT: "documents:registry.read",
};

export type RequestInteractionInput = {
  interactionType: string;
  /** Target sector (required when no scene/twin reference is supplied). */
  sector?: VizSectorCode;
  sceneId?: string | null;
  twinId?: string | null;
  /** `${subjectType}:${subjectId}` object reference the gesture addressed. */
  objectRef?: string | null;
  targetDomain?: InteractionTargetDomain | null;
  targetRef?: string | null;
  deviceId?: string | null;
  rationale?: string | null;
};

export type InteractionResult = {
  interactionId: string;
  interactionType: InteractionType;
  outcome: InteractionOutcome;
  reason: string;
  sector: VizSectorCode;
  targetDomain: InteractionTargetDomain | null;
  /** For DELEGATED results: the governed surface that owns the next step. */
  delegation?: { targetDomain: InteractionTargetDomain; canonicalSurface: string; requiredPermission: string; note: string } | null;
  createdAt: string;
};

const DELEGATION_SURFACES: Record<InteractionTargetDomain, { surface: string; permission: string; note: string }> = {
  GOVERNANCE: {
    surface: "/os/governance",
    permission: "governance:resolution.read",
    note: "Governance bodies, resolutions and votes own approval; Holograph records the request only.",
  },
  FINANCE_CAPITAL: {
    surface: "/os/capital",
    permission: "finance:capital.read",
    note: "Finance OS owns capital requests and posting authorization; CAP_POSTING remains LOCKED and no interaction path posts anything.",
  },
  FAMILY_OFFICE: {
    surface: "/os/family",
    permission: "family:member.read",
    note: "Family Office governance workflows own the approval chain; Holograph records the request only.",
  },
  DOCUMENT: {
    surface: "/os/documents",
    permission: "documents:registry.read",
    note: "The Documents & Knowledge registry owns access; the interaction never grants document access.",
  },
  LEGAL: {
    surface: "/os/legal",
    permission: "legal:matter.read",
    note: "Legal matters and human legal authority own the decision; Holograph records the request only.",
  },
  ORGANIZATION: {
    surface: "/os/organization",
    permission: "organization:entity.read",
    note: "Organization & Ownership owns entity governance; Holograph records the request only.",
  },
};

async function resolveTarget(
  principal: Principal,
  input: RequestInteractionInput,
): Promise<{ sector: VizSectorCode; sceneId: string | null; twinId: string | null; error: string | null }> {
  if (input.sceneId) {
    // Deep-link re-authorization: the scene reference is re-checked
    // server-side (tenant, entity, classification, permission, sector).
    const scene = await getScene(principal, input.sceneId);
    if (!scene) return { sector: "BEYU", sceneId: null, twinId: null, error: "Scene reference does not resolve within your authorized scope." };
    return { sector: scene.sector, sceneId: scene.id, twinId: null, error: null };
  }
  if (input.twinId) {
    const twin = await getTwinRegistration(principal, input.twinId);
    if (!twin) return { sector: "BEYU", sceneId: null, twinId: null, error: "Digital twin reference does not resolve within your authorized scope." };
    return { sector: twin.sector, sceneId: null, twinId: twin.id, error: null };
  }
  if (!input.sector) {
    return { sector: "BEYU", sceneId: null, twinId: null, error: "An interaction must target a scene, a digital twin or an explicit sector." };
  }
  if (!(VIZ_SECTOR_CODES as readonly string[]).includes(input.sector)) {
    return { sector: "BEYU", sceneId: null, twinId: null, error: `Unknown sector '${String(input.sector)}'.` };
  }
  return { sector: input.sector, sceneId: null, twinId: null, error: null };
}

/**
 * Authorize + ledger a governed interaction. Always writes the ledger row
 * (ALLOWED / DENIED / DELEGATED) plus audit + event. Throws ONLY for
 * validation errors (bad input shape); authorization denials are returned as
 * DENIED results (and audited), mirroring the deep-link NOT_FOUND rule.
 */
export async function requestInteraction(input: RequestInteractionInput, actor: VizActor, principal: Principal): Promise<InteractionResult> {
  if (!(VIZ_INTERACTION_TYPES as readonly string[]).includes(input.interactionType)) {
    throw new VizDomainError("INVALID_STATE", `Unknown interaction type '${String(input.interactionType)}'. Canonical types: ${VIZ_INTERACTION_TYPES.join(", ")}.`);
  }
  const type = input.interactionType as InteractionType;

  const interactionId = newId(ID_PREFIX.vizInteraction);
  const target = await resolveTarget(principal, input);

  // Build the decision chain (every stage reuses the existing kernel).
  let outcome: InteractionOutcome = "DENIED";
  let reason = "";
  let sector: VizSectorCode = target.sector;
  let sceneId: string | null = target.sceneId;
  let twinId: string | null = target.twinId;
  let delegation: InteractionResult["delegation"] = null;

  const scopeRefusal = entityScopeRefusal(principal);

  if (target.error) {
    reason = target.error;
  } else if (scopeRefusal) {
    reason = scopeRefusal;
  } else {
    // Sector boundary (the SAME canonical sector resolvers the launcher uses).
    const sectorAccess = await assertSectorAccess(principal, target.sector);
    if (!sectorAccess.allowed) {
      reason = sectorAccess.reason;
    } else if (NAVIGATION_TYPES.includes(type) || DELEGATION_TYPES.includes(type)) {
      const domain = input.targetDomain;
      if (!domain || !(VIZ_INTERACTION_TARGET_DOMAINS as readonly string[]).includes(domain)) {
        reason = `${type} requires a canonical target domain (${VIZ_INTERACTION_TARGET_DOMAINS.join(", ")}).`;
      } else {
        const surfacePermission = TARGET_SURFACE_PERMISSION[type];
        if (surfacePermission && !can(principal, surfacePermission as never).allowed) {
          reason = `${type} requires ${surfacePermission} on the target surface; the interaction records intent only and the target re-runs its own boundary.`;
        } else {
          // The request is authorized AS A RECORD: presentation/navigation
          // intents are ALLOWED; workflow/approval intents are DELEGATED to
          // the target's governed workflow (never executed here).
          if (DELEGATION_TYPES.includes(type)) {
            outcome = "DELEGATED";
            const surface = DELEGATION_SURFACES[domain];
            reason = `Delegated to ${surface.surface} (target owns approval and execution). Holograph executed nothing.`;
            delegation = {
              targetDomain: domain,
              canonicalSurface: surface.surface,
              requiredPermission: surface.permission,
              note: surface.note,
            };
          } else {
            outcome = "ALLOWED";
            reason = "Authorized presentation/navigation interaction; the target surface re-runs its own boundary on arrival.";
          }
        }
      }
    } else if (type === "VIEW_EVENT" && !can(principal, "audit:event.read" as PermissionCode).allowed) {
      reason = "VIEW_EVENT requires audit:event.read on the event stream surface.";
    } else if (type === "VIEW_AUDIT_CONTEXT" && !can(principal, "audit:log.read" as PermissionCode).allowed) {
      reason = "VIEW_AUDIT_CONTEXT requires audit:log.read on the audit ledger surface.";
    } else if (PRESENTATION_TYPES.includes(type)) {
      outcome = "ALLOWED";
      reason = "Authorized presentation interaction over the already-governed manifest; no new data fetched.";
    } else {
      reason = `Interaction type '${type}' is not permitted from the Holograph surface.`;
    }
  }

  const classification: Classification = "INTERNAL";
  const row = {
    id: interactionId,
    tenantId: actor.tenantId,
    sceneId,
    twinId,
    sector,
    objectRef: input.objectRef?.trim() || null,
    interactionType: type,
    targetDomain: input.targetDomain ?? null,
    targetRef: input.targetRef?.trim() || null,
    outcome,
    reason,
    deviceId: input.deviceId ?? null,
    classification,
    requestedByUserId: actor.userId,
    traceId: actor.traceId,
  };

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(s.vizInteractions).values(row);
      return { id: interactionId };
    },
    () => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: `VIZ_INTERACTION_${outcome}`,
      objectType: "VIZ_INTERACTION",
      objectId: interactionId,
      outcome: outcome === "ALLOWED" ? ("SUCCESS" as const) : ("DENIED" as const),
      authority: "viz:interaction.execute" as const,
      reason,
      newValue: {
        interactionType: type,
        sector,
        objectRef: row.objectRef,
        targetDomain: row.targetDomain,
        targetRef: row.targetRef,
        outcome,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_INTERACTION_REQUESTED",
        operation: "REQUEST_INTERACTION",
        tenantId: actor.tenantId,
        subjectType: "VIZ_INTERACTION",
        subjectId: interactionId,
        actorUserId: actor.userId,
        classification,
        payload: {
          interactionType: type,
          sector,
          outcome,
          targetDomain: row.targetDomain,
          // No object coordinates, names or row-level values in the payload:
          // the ledger + audit carry the reference; the event stays a
          // shape/status signal so it can never be a leak channel.
        },
        traceId: actor.traceId,
      }),
  );

  return {
    interactionId,
    interactionType: type,
    outcome,
    reason,
    sector,
    targetDomain: input.targetDomain ?? null,
    delegation,
    createdAt: new Date().toISOString(),
  };
}

/** List the interaction ledger for the principal's tenant (classification-
 * filtered). Denied rows are included — the ledger is the capability's
 * security record. */
export async function listInteractions(
  principal: Principal,
  opts: { interactionType?: InteractionType; outcome?: InteractionOutcome; sceneId?: string; limit?: number } = {},
) {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [
    eq(s.vizInteractions.tenantId, principal.tenantId),
    inArray(s.vizInteractions.classification, allowed as Classification[]),
  ];
  if (opts.interactionType) conditions.push(eq(s.vizInteractions.interactionType, opts.interactionType));
  if (opts.outcome) conditions.push(eq(s.vizInteractions.outcome, opts.outcome));
  if (opts.sceneId) conditions.push(eq(s.vizInteractions.sceneId, opts.sceneId));
  const rows = await db
    .select()
    .from(s.vizInteractions)
    .where(and(...conditions))
    .orderBy(desc(s.vizInteractions.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
  return rows.map((r) => ({
    id: r.id,
    sceneId: r.sceneId,
    twinId: r.twinId,
    sector: r.sector,
    objectRef: r.objectRef,
    interactionType: r.interactionType,
    targetDomain: r.targetDomain,
    targetRef: r.targetRef,
    outcome: r.outcome,
    reason: r.reason,
    deviceId: r.deviceId,
    classification: r.classification,
    requestedByUserId: r.requestedByUserId,
    traceId: r.traceId,
    createdAt: r.createdAt.toISOString(),
  }));
}
