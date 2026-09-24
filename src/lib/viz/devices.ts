/**
 * BEYU OS — HOLOGRAPH DEVICE REGISTRY (shared capability, migration 0067).
 *
 * The hardware-independent device abstraction: which presentation devices are
 * registered to serve governed scenes, with an honest rendering backend and a
 * governed lifecycle.
 *
 * INvariants
 * ──────────
 *   • A device is a PRESENTATION security context, not an authorization
 *     boundary. Registering a device grants no data access; the renderer is
 *     never an authority (the manifest it receives was already authorized).
 *   • HONESTY. No physical holographic hardware support exists in this
 *     repository and none is claimed: a FUTURE_HOLOGRAPHIC_DEVICE row can only
 *     ever be REGISTERED or NOT_IMPLEMENTED (enforced in SQL AND here). A
 *     device can only reach ACTIVE when its declared rendering backend is an
 *     IMPLEMENTED renderer in the canonical renderer registry.
 *   • Lifecycle: REGISTERED → ACTIVE → SUSPENDED; any non-terminal state →
 *     REVOKED (terminal). NOT_IMPLEMENTED may be left for future classes.
 *   • Every mutation runs through withAuditTransaction (the EXISTING chain).
 *   • viz:device.manage is HIGH-RISK (MFA step-up) at the authorization layer.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { reauthorizeDeepLink } from "./authorization";
import { VizDomainError } from "./errors";
import { vizEventInput } from "./events";
import { RENDERER_KINDS, rendererCapabilityMatrix } from "./renderers";
import type { VizActor } from "./service";

export type VizDeviceRecord = {
  id: string;
  tenantId: string;
  name: string;
  deviceClass: string;
  renderingBackend: string;
  status: "REGISTERED" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "NOT_IMPLEMENTED";
  capabilities: string[];
  provenance: { registeredBy: string; rationale: string; registeredAt: string };
  classification: Classification;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

const FUTURE_HOLOGRAPHIC = "FUTURE_HOLOGRAPHIC_DEVICE";
const TERMINAL_STATES: VizDeviceRecord["status"][] = ["REVOKED"];
/** States a FUTURE_HOLOGRAPHIC_DEVICE row may carry (SQL enforces the same). */
const FUTURE_ALLOWED_STATES: VizDeviceRecord["status"][] = ["REGISTERED", "NOT_IMPLEMENTED"];

function rendererIsImplemented(kind: string): boolean {
  const entry = rendererCapabilityMatrix().find((r) => r.kind === kind);
  return entry?.status === "IMPLEMENTED";
}

function deviceRowToRecord(row: typeof s.vizDevices.$inferSelect): VizDeviceRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    deviceClass: row.deviceClass,
    renderingBackend: row.renderingBackend,
    status: row.status as VizDeviceRecord["status"],
    capabilities: (row.capabilities as string[]) ?? [],
    provenance: row.provenance as VizDeviceRecord["provenance"],
    classification: row.classification,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDevices(
  principal: Principal,
  opts: { deviceClass?: string; status?: VizDeviceRecord["status"]; limit?: number } = {},
): Promise<VizDeviceRecord[]> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [
    eq(s.vizDevices.tenantId, principal.tenantId),
    inArray(s.vizDevices.classification, allowed as Classification[]),
  ];
  if (opts.deviceClass) conditions.push(eq(s.vizDevices.deviceClass, opts.deviceClass));
  if (opts.status) conditions.push(eq(s.vizDevices.status, opts.status));
  const rows = await db
    .select()
    .from(s.vizDevices)
    .where(and(...conditions))
    .orderBy(desc(s.vizDevices.updatedAt))
    .limit(Math.min(opts.limit ?? 100, 200));
  return rows.map(deviceRowToRecord);
}

export async function getDevice(principal: Principal, deviceId: string): Promise<VizDeviceRecord | null> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const [row] = await db
    .select()
    .from(s.vizDevices)
    .where(
      and(
        eq(s.vizDevices.id, deviceId),
        eq(s.vizDevices.tenantId, principal.tenantId),
        inArray(s.vizDevices.classification, allowed as Classification[]),
      ),
    )
    .limit(1);
  if (!row) return null;
  const record = deviceRowToRecord(row);
  const decision = await reauthorizeDeepLink(
    principal,
    { tenantId: record.tenantId, classification: record.classification },
    "viz:asset.read",
  );
  if (!decision.allowed) {
    if (decision.notFound) return null;
    throw new VizDomainError("SCOPE", decision.reason);
  }
  return record;
}

export type RegisterDeviceInput = {
  name: string;
  deviceClass: string;
  renderingBackend: string;
  capabilities?: string[];
  rationale: string;
  classification?: Classification;
};

const VIZ_DEVICE_CLASSES = ["WEB", "DESKTOP", "MOBILE", "AR", "VR", "SPATIAL_DISPLAY", "VOLUMETRIC_DISPLAY", FUTURE_HOLOGRAPHIC] as const;

/** Register a device (viz:device.manage, HIGH-RISK). The device starts
 * REGISTERED (or NOT_IMPLEMENTED for future-holographic rows — the honest
 * state for a device class no implementation exists for). */
export async function registerDevice(input: RegisterDeviceInput, actor: VizActor, principal: Principal) {
  if (!input.name.trim()) throw new VizDomainError("INVALID_STATE", "A device requires a name.");
  if (!(VIZ_DEVICE_CLASSES as readonly string[]).includes(input.deviceClass)) {
    throw new VizDomainError("INVALID_STATE", `Unknown device class '${String(input.deviceClass)}'. Canonical classes: ${VIZ_DEVICE_CLASSES.join(", ")}.`);
  }
  if (!(RENDERER_KINDS as readonly string[]).includes(input.renderingBackend)) {
    throw new VizDomainError("INVALID_STATE", `Unknown rendering backend '${String(input.renderingBackend)}'. Canonical renderer kinds: ${RENDERER_KINDS.join(", ")}.`);
  }
  if (!input.rationale.trim()) throw new VizDomainError("INVALID_STATE", "Device registration requires a rationale (provenance).");

  const isFuture = input.deviceClass === FUTURE_HOLOGRAPHIC;
  const initialStatus: VizDeviceRecord["status"] = isFuture ? "NOT_IMPLEMENTED" : "REGISTERED";

  const id = newId(ID_PREFIX.vizDevice);
  const classification = input.classification ?? "INTERNAL";

  return withAuditTransaction(
    async (tx) => {
      const [existing] = await tx
        .select({ id: s.vizDevices.id })
        .from(s.vizDevices)
        .where(and(eq(s.vizDevices.tenantId, actor.tenantId), eq(s.vizDevices.name, input.name.trim())))
        .limit(1);
      if (existing) throw new VizDomainError("CONFLICT", `A device named '${input.name.trim()}' is already registered in this tenant.`);
      const row = {
        id,
        tenantId: actor.tenantId,
        name: input.name.trim(),
        deviceClass: input.deviceClass,
        renderingBackend: input.renderingBackend,
        status: initialStatus,
        capabilities: input.capabilities ?? [],
        provenance: {
          registeredBy: actor.userId,
          rationale: input.rationale.trim(),
          registeredAt: new Date().toISOString(),
        },
        classification,
        createdByUserId: actor.userId,
      };
      const [created] = await tx.insert(s.vizDevices).values(row).returning();
      return deviceRowToRecord(created);
    },
    (row) => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_DEVICE_REGISTERED",
      objectType: "VIZ_DEVICE",
      objectId: row.id,
      outcome: "SUCCESS" as const,
      authority: "viz:device.manage" as PermissionCode,
      newValue: { name: row.name, deviceClass: row.deviceClass, renderingBackend: row.renderingBackend, status: row.status },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_DEVICE_REGISTERED",
        operation: "REGISTER_DEVICE",
        tenantId: actor.tenantId,
        subjectType: "VIZ_DEVICE",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { deviceClass: row.deviceClass, renderingBackend: row.renderingBackend, status: row.status },
        traceId: actor.traceId,
      }),
  );
}

const ALLOWED_TRANSITIONS: Record<VizDeviceRecord["status"], VizDeviceRecord["status"][]> = {
  REGISTERED: ["ACTIVE", "SUSPENDED", "REVOKED", "NOT_IMPLEMENTED"],
  ACTIVE: ["SUSPENDED", "REVOKED"],
  SUSPENDED: ["ACTIVE", "REVOKED"],
  NOT_IMPLEMENTED: ["REGISTERED"],
  REVOKED: [],
};

/** Transition a device's lifecycle (viz:device.manage, HIGH-RISK).
 * Terminal: REVOKED. Future-holographic rows can never be ACTIVE/SUSPENDED.
 * ACTIVE additionally requires an IMPLEMENTED rendering backend. */
export async function setDeviceStatus(deviceId: string, status: VizDeviceRecord["status"], rationale: string, actor: VizActor, principal: Principal) {
  const device = await getDevice(principal, deviceId);
  if (!device) throw new VizDomainError("NOT_FOUND", "Device not found within your authorized scope");
  if (!rationale.trim()) throw new VizDomainError("INVALID_STATE", "A device lifecycle transition requires a rationale (provenance).");
  if (TERMINAL_STATES.includes(device.status)) {
    throw new VizDomainError("INVALID_STATE", `Device is ${device.status}; that lifecycle state is terminal.`);
  }
  // The honesty guard for the reserved class precedes the generic transition
  // check so its specific, truthful refusal is always the one reported (the
  // database CHECK constraint enforces the same invariant as the final floor).
  if (device.deviceClass === FUTURE_HOLOGRAPHIC && !FUTURE_ALLOWED_STATES.includes(status)) {
    throw new VizDomainError("INVALID_STATE", `A ${FUTURE_HOLOGRAPHIC} can only be REGISTERED or NOT_IMPLEMENTED: no physical holographic hardware support exists in BEYU OS and none is claimed.`);
  }
  if (!ALLOWED_TRANSITIONS[device.status].includes(status)) {
    throw new VizDomainError("INVALID_STATE", `Illegal device lifecycle transition ${device.status} → ${status}. Allowed: ${ALLOWED_TRANSITIONS[device.status].join(", ") || "none"}.`);
  }
  if (status === "ACTIVE" && !rendererIsImplemented(device.renderingBackend)) {
    throw new VizDomainError("INVALID_STATE", `Cannot activate a device whose rendering backend '${device.renderingBackend}' is not an IMPLEMENTED renderer. The capability status matrix is honest: presenting on it would fabricate capability.`);
  }

  return withAuditTransaction(
    async (tx) => {
      await tx
        .update(s.vizDevices)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(s.vizDevices.id, deviceId), eq(s.vizDevices.tenantId, actor.tenantId)));
      return { id: deviceId, status };
    },
    () => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_DEVICE_STATUS_CHANGED",
      objectType: "VIZ_DEVICE",
      objectId: deviceId,
      outcome: "SUCCESS" as const,
      authority: "viz:device.manage" as PermissionCode,
      reason: rationale.trim(),
      oldValue: { status: device.status },
      newValue: { status },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_DEVICE_STATUS_CHANGED",
        operation: "SET_DEVICE_STATUS",
        tenantId: actor.tenantId,
        subjectType: "VIZ_DEVICE",
        subjectId: deviceId,
        actorUserId: actor.userId,
        classification: device.classification,
        payload: { deviceClass: device.deviceClass, from: device.status, to: status },
        traceId: actor.traceId,
      }),
  );
}
