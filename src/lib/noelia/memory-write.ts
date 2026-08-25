/**
 * ITERATION 11 — GOVERNED ENTERPRISE MEMORY WRITES
 *
 * Before this module, memory (knowledge_sources) could only be created by
 * the bootstrap seed. Writes now exist, and every write is governed:
 *
 *   WRITE → VALIDATE → CLASSIFY → AUTHORIZE → STORE → INDEX → RETRIEVE
 *         → VERIFY → PRESENT
 *
 * Rules enforced here (fail closed on violation):
 *   1. RBAC: the writer needs `knowledge:source.write`.
 *   2. Scope: tenant-scoped memory only for tenants inside the writer's
 *      tenant subtree; GLOBAL memory only for enterprise-scoped writers.
 *   3. Shape: the DB CHECK + this module both reject inconsistent scope
 *      shapes; unknown scope classes are denied.
 *   4. Classification: the writer's clearance must cover the record's
 *      classification (no classification escalation).
 *   5. Authority: ONLY a HUMAN actor may create AUTHORITATIVE memory.
 *      AI/SERVICE writes are forced to UNDER_REVIEW — memory poisoning
 *      through the AI path can never become authoritative.
 *   6. Provenance: required and substantive (no anonymous memory).
 *   7. Window: effectiveFrom ≤ reviewDate; expiresAt > reviewDate; a new
 *      record must be current at creation (reviewDate ≥ today).
 *   8. Integrity: content is SHA-256 checksummed; a re-submission with the
 *      same code+content+version is an idempotent no-op (replay-safe) and
 *      the attempt is audited.
 *   9. Deletion policy: memory is evidence — decommission (REJECTED +
 *      decommissioned_at) is the only application path; there is no hard
 *      delete.
 *  10. Continuity: LONG_TERM_CONTINUITY memory never expires (DB CHECK)
 *      and is enterprise-only at read time.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { publishEventTx, recordAuditTx } from "@/lib/audit";
import { classificationRank, isKnownClassification, type Classification } from "@/lib/constants";
import { hasGlobalGovernanceScope, tenantScopeIds } from "@/lib/tenant-scope";
import { KNOWLEDGE_SCOPE_TYPES } from "./memory";

export const MEMORY_WRITE_PERMISSION = "knowledge:source.write";

export type MemoryDenialCode =
  | "CONTEXT_MISSING"
  | "PERMISSION_DENIED"
  | "UNKNOWN_SCOPE"
  | "SCOPE_SHAPE_INVALID"
  | "TENANT_OUT_OF_SCOPE"
  | "GLOBAL_REQUIRES_ENTERPRISE"
  | "CLASSIFICATION_ESCALATION"
  | "AUTHORITY_STATUS_DENIED"
  | "PROVENANCE_MISSING"
  | "WINDOW_INVALID"
  | "CONTINUITY_EXPIRES_INVALID";

export class MemoryWriteDenied extends Error {
  constructor(
    readonly code: MemoryDenialCode,
    message: string,
  ) {
    super(message);
    this.name = "MemoryWriteDenied";
  }
}

export type MemoryWriteInput = {
  code: string;
  title: string;
  domain: string;
  content: string;
  provenance: string;
  scopeType: string;
  tenantId?: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  classification: string;
  /** Requested authority status; AI actors are forced to UNDER_REVIEW. */
  authorityStatus: string;
  effectiveFrom: string;
  reviewDate: string;
  expiresAt?: string | null;
  keywords?: string[];
  ownerRole?: string;
  jurisdictionCode?: string | null;
  sourceUri?: string | null;
  version?: string;
};

export type MemoryWriteResult = {
  code: string;
  created: boolean;
  replayed: boolean;
  version: string;
  authorityStatus: string;
};

export function contentChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const TENANT_SCOPED = new Set(["ENTERPRISE", "TENANT", "ORGANIZATIONAL", "LONG_TERM_CONTINUITY"]);

function validateScope(input: MemoryWriteInput): void {
  if (!(KNOWLEDGE_SCOPE_TYPES as readonly string[]).includes(input.scopeType)) {
    throw new MemoryWriteDenied("UNKNOWN_SCOPE", `Unknown memory scope class '${input.scopeType}'.`);
  }
  const { scopeType, tenantId, legalEntityId, countryCode } = input;
  const shapeOk =
    (scopeType === "GLOBAL" && !tenantId && !legalEntityId && !countryCode) ||
    (TENANT_SCOPED.has(scopeType) && Boolean(tenantId) && !legalEntityId && !countryCode) ||
    (scopeType === "ENTITY" && Boolean(tenantId) && Boolean(legalEntityId) && !countryCode) ||
    (scopeType === "COUNTRY" && Boolean(tenantId) && !legalEntityId && Boolean(countryCode));
  if (!shapeOk) {
    throw new MemoryWriteDenied(
      "SCOPE_SHAPE_INVALID",
      `Scope '${scopeType}' requires a consistent tenant/entity/country shape.`,
    );
  }
  if (scopeType === "LONG_TERM_CONTINUITY" && input.expiresAt) {
    throw new MemoryWriteDenied(
      "CONTINUITY_EXPIRES_INVALID",
      "LONG_TERM_CONTINUITY memory never expires; expiresAt must be null.",
    );
  }
}

function bumpMinorVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "1.0.1";
  return `${parts[0]}.${Number(parts[1]) + 1}.${parts[2]}`;
}

export async function upsertMemorySource(
  principal: Principal,
  input: MemoryWriteInput,
  actorType: "HUMAN" | "AI" = "HUMAN",
): Promise<MemoryWriteResult> {
  if (!hasDatabaseTransactionContext()) {
    throw new MemoryWriteDenied("CONTEXT_MISSING", "Memory writes require canonical transaction-scoped tenant context.");
  }

  // 1. RBAC.
  const access = can(principal, MEMORY_WRITE_PERMISSION);
  if (!access.allowed) {
    throw new MemoryWriteDenied("PERMISSION_DENIED", `Memory write denied: ${access.reason}`);
  }

  // 3. Shape + 10. continuity.
  validateScope(input);

  // 2. Scope authorization.
  const enterprise = hasGlobalGovernanceScope(principal);
  if (input.scopeType === "GLOBAL" && !enterprise) {
    throw new MemoryWriteDenied(
      "GLOBAL_REQUIRES_ENTERPRISE",
      "GLOBAL memory is enterprise-restricted; a tenant-scoped writer cannot create it.",
    );
  }
  if (input.tenantId) {
    const allowedTenants = enterprise ? await tenantScopeIds(principal) : [principal.tenantId];
    if (!allowedTenants.includes(input.tenantId)) {
      throw new MemoryWriteDenied(
        "TENANT_OUT_OF_SCOPE",
        `Tenant ${input.tenantId} is outside the writer's authorized tenant subtree.`,
      );
    }
  }

  // 4. Classification ceiling.
  if (
    !isKnownClassification(input.classification) ||
    classificationRank(input.classification) > classificationRank(principal.clearance)
  ) {
    throw new MemoryWriteDenied(
      "CLASSIFICATION_ESCALATION",
      `Record classification ${input.classification} exceeds the writer's clearance ${principal.clearance}.`,
    );
  }

  // 5. Authority rules — the anti-poisoning core.
  const requestedStatus = input.authorityStatus;
  if (!["AUTHORITATIVE", "UNDER_REVIEW", "SUPERSEDED", "EXPIRED", "REJECTED"].includes(requestedStatus)) {
    throw new MemoryWriteDenied("AUTHORITY_STATUS_DENIED", `Unknown authority status '${requestedStatus}'.`);
  }
  let effectiveStatus = requestedStatus;
  if (actorType !== "HUMAN") {
    // AI and service actors can never create (or promote to) authoritative memory.
    effectiveStatus = "UNDER_REVIEW";
  }

  // 6. Provenance.
  if (!input.provenance || input.provenance.trim().length < 8) {
    throw new MemoryWriteDenied("PROVENANCE_MISSING", "Memory requires substantive provenance (origin, owner, review).");
  }

  // 7. Window validity.
  const today = new Date().toISOString().slice(0, 10);
  if (input.effectiveFrom > input.reviewDate) {
    throw new MemoryWriteDenied("WINDOW_INVALID", "effectiveFrom must not be after reviewDate.");
  }
  if (input.expiresAt && input.expiresAt <= input.reviewDate) {
    throw new MemoryWriteDenied("WINDOW_INVALID", "expiresAt must be after reviewDate.");
  }
  if (input.reviewDate < today) {
    throw new MemoryWriteDenied("WINDOW_INVALID", "New memory must be current at creation (reviewDate >= today).");
  }

  const checksum = contentChecksum(input.content);

  return db.transaction(async (tx) => {
    const table = tx as unknown as typeof db;
    const [existing] = await table.select().from(knowledgeSources).where(eq(knowledgeSources.code, input.code)).limit(1);

    if (existing) {
      // Idempotent replay: identical content + version → no-op, but the
      // attempt is audited (replay detection).
      if (existing.contentChecksum === checksum && existing.version === (input.version ?? existing.version)) {
        await recordAuditTx(tx, {
          tenantId: input.tenantId ?? principal.tenantId,
          actorUserId: principal.userId,
          actorType,
          action: "knowledge.source.replay_ignored",
          objectType: "KNOWLEDGE_SOURCE",
          objectId: existing.code,
          outcome: "SUCCESS",
          reason: "Identical re-submission (same content+version); no mutation performed.",
          traceId: principal.sessionId,
        });
        return {
          code: existing.code,
          created: false,
          replayed: true,
          version: existing.version,
          authorityStatus: existing.authorityStatus,
        };
      }

      const contentChanged = existing.contentChecksum !== checksum;
      const nextVersion = input.version ?? (contentChanged ? bumpMinorVersion(existing.version) : existing.version);
      const oldValue = { version: existing.version, authorityStatus: existing.authorityStatus, checksum: existing.contentChecksum ?? null };
      const newValue = { version: nextVersion, authorityStatus: effectiveStatus, checksum, provenance: input.provenance };
      await table.update(knowledgeSources).set({
        title: input.title,
        domain: input.domain,
        content: input.content,
        scopeType: input.scopeType,
        tenantId: input.tenantId ?? null,
        legalEntityId: input.legalEntityId ?? null,
        countryCode: input.countryCode ?? null,
        classification: input.classification as Classification,
        authorityStatus: effectiveStatus as (typeof existing.authorityStatus),
        provenance: input.provenance,
        effectiveFrom: input.effectiveFrom,
        reviewDate: input.reviewDate,
        expiresAt: input.expiresAt ?? null,
        keywords: input.keywords ?? existing.keywords,
        ownerRole: input.ownerRole ?? existing.ownerRole,
        jurisdictionCode: input.jurisdictionCode ?? existing.jurisdictionCode,
        sourceUri: input.sourceUri ?? existing.sourceUri,
        version: nextVersion,
        contentChecksum: checksum,
        updatedByUserId: principal.userId,
        updatedAt: new Date(),
        decommissionedAt: null,
      }).where(eq(knowledgeSources.code, input.code));
      await recordAuditTx(tx, {
        tenantId: input.tenantId ?? principal.tenantId,
        actorUserId: principal.userId,
        actorType,
        action: "knowledge.source.update",
        objectType: "KNOWLEDGE_SOURCE",
        objectId: existing.code,
        outcome: "SUCCESS",
        reason: contentChanged ? `Content changed; version ${existing.version} → ${nextVersion}.` : `Governance fields updated; version → ${nextVersion}.`,
        oldValue,
        newValue,
        traceId: principal.sessionId,
      });
      await publishEventTx(tx, {
        type: "KNOWLEDGE_SOURCE_UPDATED",
        source: "beyu-os/memory",
        domain: "MEMORY",
        operation: "MEMORY_UPDATE",
        destinationDomain: null,
        tenantId: input.tenantId ?? principal.tenantId,
        legalEntityId: input.legalEntityId ?? null,
        subjectType: "KNOWLEDGE_SOURCE",
        subjectId: existing.code,
        actorUserId: principal.userId,
        actorType,
        classification: input.classification as Classification,
        payload: { version: nextVersion, authorityStatus: effectiveStatus },
        traceId: principal.sessionId,
        correlationId: principal.sessionId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: MEMORY_WRITE_PERMISSION,
          policyVersion: null,
        },
        policyVersion: null,
      });
      return { code: existing.code, created: false, replayed: false, version: nextVersion, authorityStatus: effectiveStatus };
    }

    const newValue = { version: input.version ?? "1.0.0", authorityStatus: effectiveStatus, checksum };
    await table.insert(knowledgeSources).values({
      id: `KNW_${input.code.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60)}`,
      code: input.code,
      title: input.title,
      domain: input.domain,
      content: input.content,
      scopeType: input.scopeType,
      tenantId: input.tenantId ?? null,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      classification: input.classification as Classification,
      authorityStatus: effectiveStatus as "AUTHORITATIVE",
      provenance: input.provenance,
      effectiveFrom: input.effectiveFrom,
      reviewDate: input.reviewDate,
      expiresAt: input.expiresAt ?? null,
      keywords: input.keywords ?? [],
      ownerRole: input.ownerRole ?? principal.roles[0] ?? "UNSPECIFIED",
      jurisdictionCode: input.jurisdictionCode ?? null,
      sourceUri: input.sourceUri ?? null,
      version: input.version ?? "1.0.0",
      contentChecksum: checksum,
      createdByUserId: principal.userId,
      updatedByUserId: principal.userId,
    });
    await recordAuditTx(tx, {
      tenantId: input.tenantId ?? principal.tenantId,
      actorUserId: principal.userId,
      actorType,
      action: "knowledge.source.create",
      objectType: "KNOWLEDGE_SOURCE",
      objectId: input.code,
      outcome: "SUCCESS",
      reason: `Memory '${input.code}' created as ${effectiveStatus}.`,
      newValue,
      traceId: principal.sessionId,
    });
    await publishEventTx(tx, {
      type: "KNOWLEDGE_SOURCE_CREATED",
      source: "beyu-os/memory",
      domain: "MEMORY",
      operation: "MEMORY_CREATE",
      destinationDomain: null,
      tenantId: input.tenantId ?? principal.tenantId,
      legalEntityId: input.legalEntityId ?? null,
      subjectType: "KNOWLEDGE_SOURCE",
      subjectId: input.code,
      actorUserId: principal.userId,
      actorType,
      classification: input.classification as Classification,
      payload: { version: input.version ?? "1.0.0", authorityStatus: effectiveStatus, scopeType: input.scopeType },
      traceId: principal.sessionId,
      correlationId: principal.sessionId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: MEMORY_WRITE_PERMISSION,
        policyVersion: null,
      },
      policyVersion: null,
    });
    return { code: input.code, created: true, replayed: false, version: input.version ?? "1.0.0", authorityStatus: effectiveStatus };
  });
}

/**
 * Soft decommission: the only sanctioned "deletion" path. The record remains
 * as evidence (audit-grade); retrieval excludes it through authorityStatus.
 */
export async function decommissionMemorySource(
  principal: Principal,
  code: string,
  actorType: "HUMAN" | "AI" = "HUMAN",
): Promise<{ code: string; decommissioned: boolean }> {
  if (!hasDatabaseTransactionContext()) {
    throw new MemoryWriteDenied("CONTEXT_MISSING", "Memory writes require canonical transaction-scoped tenant context.");
  }
  const access = can(principal, MEMORY_WRITE_PERMISSION);
  if (!access.allowed) {
    throw new MemoryWriteDenied("PERMISSION_DENIED", `Decommission denied: ${access.reason}`);
  }

  return db.transaction(async (tx) => {
    const table = tx as unknown as typeof db;
    const [record] = await table.select().from(knowledgeSources).where(eq(knowledgeSources.code, code)).limit(1);
    if (!record) {
      throw new MemoryWriteDenied("PERMISSION_DENIED", `Memory '${code}' not found in the authorized tenant scope.`);
    }
    const allowedTenants = hasGlobalGovernanceScope(principal)
      ? await tenantScopeIds(principal)
      : [principal.tenantId];
    if (record.tenantId && !allowedTenants.includes(record.tenantId)) {
      throw new MemoryWriteDenied("TENANT_OUT_OF_SCOPE", `Tenant ${record.tenantId} is outside the writer's authorized tenant subtree.`);
    }
    if (record.authorityStatus === "REJECTED" && record.decommissionedAt) {
      return { code, decommissioned: false };
    }
    await table.update(knowledgeSources).set({
      authorityStatus: "REJECTED" as const,
      decommissionedAt: new Date(),
      updatedByUserId: principal.userId,
      updatedAt: new Date(),
    }).where(eq(knowledgeSources.code, code));
    await recordAuditTx(tx, {
      tenantId: record.tenantId ?? principal.tenantId,
      actorUserId: principal.userId,
      actorType,
      action: "knowledge.source.decommission",
      objectType: "KNOWLEDGE_SOURCE",
      objectId: code,
      outcome: "SUCCESS",
      reason: `Memory '${code}' decommissioned (soft delete; record retained as evidence).`,
      oldValue: { authorityStatus: record.authorityStatus },
      newValue: { authorityStatus: "REJECTED" },
      traceId: principal.sessionId,
    });
    await publishEventTx(tx, {
      type: "KNOWLEDGE_SOURCE_DECOMMISSIONED",
      source: "beyu-os/memory",
      domain: "MEMORY",
      operation: "MEMORY_DECOMMISSION",
      destinationDomain: null,
      tenantId: record.tenantId ?? principal.tenantId,
      legalEntityId: record.legalEntityId,
      subjectType: "KNOWLEDGE_SOURCE",
      subjectId: code,
      actorUserId: principal.userId,
      actorType,
      classification: record.classification,
      payload: { version: record.version },
      traceId: principal.sessionId,
      correlationId: principal.sessionId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: MEMORY_WRITE_PERMISSION,
        policyVersion: null,
      },
      policyVersion: null,
    });
    return { code, decommissioned: true };
  });
}

export type MemoryIntegrityReport = {
  code: string;
  status: "OK" | "MISMATCH" | "UNVERIFIED_LEGACY";
  expected: string | null;
  actual: string;
};

/**
 * Re-verifies content integrity for every record visible in the current
 * tenant context. MISMATCH = tampering/poisoning detected; UNVERIFIED_LEGACY
 * (NULL checksum) fails closed as unverified, never as OK.
 */
export async function verifyMemoryIntegrity(principal: Principal): Promise<MemoryIntegrityReport[]> {
  if (!hasDatabaseTransactionContext()) {
    throw new MemoryWriteDenied("CONTEXT_MISSING", "Integrity verification requires canonical transaction-scoped tenant context.");
  }
  const rows = await db.select().from(knowledgeSources);
  return rows.map((row) => {
    const actual = contentChecksum(row.content);
    if (!row.contentChecksum) {
      return { code: row.code, status: "UNVERIFIED_LEGACY" as const, expected: null, actual };
    }
    return {
      code: row.code,
      status: row.contentChecksum === actual ? ("OK" as const) : ("MISMATCH" as const),
      expected: row.contentChecksum,
      actual,
    };
  });
}
