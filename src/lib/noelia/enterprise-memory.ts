import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  enterpriseMemory,
  knowledgeSources,
} from "@/db/schema";
import { recordAuditTx, publishEventTx } from "@/lib/audit";
import { can } from "@/lib/authz";
import {
  CLASSIFICATION_ORDER,
  classificationRank,
  isKnownClassification,
  NOELIA_IDENTITY,
  type Classification,
} from "@/lib/constants";
import { checksumOf } from "@/lib/crypto";
import { authenticateTaxLegalSource, type TaxLegalAuthorityRecord, type TaxInstrumentKind } from "@/lib/finance/tax-intelligence-capabilities";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { NoeliaToolOutput, NoeliaAuthorizedScope, ToolInvocationContext } from "./types";

export const MEMORY_CLASSES = [
  "SESSION",
  "WORKING",
  "TASK",
  "USER",
  "ORGANIZATIONAL",
  "ENTERPRISE",
  "TENANT",
  "SECTOR",
  "GOVERNANCE",
  "STRATEGIC",
  "INSTITUTIONAL",
  "LONG_TERM_CONTINUITY",
] as const;
export type MemoryClass = (typeof MEMORY_CLASSES)[number];

const MEMORY_SCOPE_TYPES = ["GLOBAL", "ENTERPRISE", "TENANT", "ENTITY", "COUNTRY"] as const;

/** Strict metadata envelope for a tax legal source entering the shared knowledge registry. */
export const TAX_LEGAL_AUTHORITY_INPUT = z.object({
  instrumentKind: z.enum(["ACT", "FINANCE_ACT", "REGULATION", "ORDER", "TREATY", "RULING", "JUDGMENT", "PRACTICE_NOTICE", "RATE_TABLE", "CUSTOMS_TARIFF", "CUSTOMS_NOTICE", "OFFICIAL_FORM", "OTHER"]),
  publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commencedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  originalSourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  officialSourceHost: z.string().min(3).max(253),
  textValidatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  textValidatedBy: z.string().min(2).max(128),
  specialistReviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  specialistReviewerId: z.string().min(2).max(128),
  enablingProvision: z.string().max(200).nullable().optional(),
  amendsSourceCodes: z.array(z.string().min(3).max(64)).max(50).default([]),
  repealsSourceCodes: z.array(z.string().min(3).max(64)).max(50).default([]),
  provisionReferences: z.array(z.string().min(1).max(120)).min(1).max(100),
}).strict();
type MemoryScopeType = (typeof MEMORY_SCOPE_TYPES)[number];

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia memory requires canonical transaction-scoped tenant context");
  }
}

/**
 * Pure visibility gate for enterprise memory. Memory is NOT authority: only
 * ACTIVE, in-window records within the principal's tenant/entity/country scope
 * and classification clearance are retrievable, and no memory record can ever
 * override current authoritative data or policy.
 */
export function decideMemoryClassVisibility(
  principal: { clearance: string },
  scope: NoeliaAuthorizedScope,
  record: {
    tenantId: string;
    legalEntityId: string | null;
    countryCode: string | null;
    classification: string;
    status: string;
    effectiveFrom: string;
    expiresAt: string | null;
    ownerUserId: string | null;
    memoryClass: string;
  },
  asOf: string,
  viewerUserId: string,
): { allowed: boolean; code: string; reason: string } {
  if (record.status !== "ACTIVE") {
    return { allowed: false, code: "MEMORY_NOT_ACTIVE", reason: "Only ACTIVE memory is retrievable." };
  }
  if (record.effectiveFrom > asOf || (record.expiresAt && record.expiresAt < asOf)) {
    return { allowed: false, code: "WINDOW_DENIED", reason: "Memory is outside its governed validity window." };
  }
  if (
    !isKnownClassification(principal.clearance) ||
    !isKnownClassification(record.classification) ||
    classificationRank(record.classification) > classificationRank(principal.clearance)
  ) {
    return { allowed: false, code: "CLASSIFICATION_DENIED", reason: "Memory exceeds the principal's clearance." };
  }
  // USER memory is private to its owner unless the viewer is the owner or has
  // enterprise governance scope.
  if (record.memoryClass === "USER" && record.ownerUserId && record.ownerUserId !== viewerUserId) {
    if (!scope.enterprise) {
      return { allowed: false, code: "OWNER_DENIED", reason: "USER memory is visible only to its owner." };
    }
  }
  if (!scope.tenantIds.includes(record.tenantId)) {
    return { allowed: false, code: "TENANT_DENIED", reason: "Memory tenant is outside the resolved scope." };
  }
  if (record.legalEntityId && !scope.legalEntityIds.includes(record.legalEntityId)) {
    return { allowed: false, code: "ENTITY_DENIED", reason: "Memory entity is outside the resolved scope." };
  }
  if (record.countryCode && !scope.countryCodes.includes(record.countryCode)) {
    return { allowed: false, code: "COUNTRY_DENIED", reason: "Memory country is outside the resolved scope." };
  }
  return { allowed: true, code: "ALLOWED", reason: "Memory is visible within the resolved scope and clearance." };
}

/**
 * Governed enterprise memory service.
 *
 * Every persistent memory object carries owner, tenant, entity, country,
 * classification, provenance, confidence, retention, expiry, supersession,
 * deletion policy, legal hold, access control and auditability. Writes are
 * audited and evented atomically; retrieval is gated by the pure visibility
 * decision above.
 */
export class BeyuNoeliaMemoryService {
  async ingestKnowledge(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const parsed = z.object({
      code: z.string().min(3).max(64),
      title: z.string().min(3).max(200),
      domain: z.string().min(2).max(40),
      content: z.string().min(10).max(20000),
      sourceUri: z.string().url().optional(),
      jurisdictionCode: z.string().length(2).optional(),
      scopeType: z.enum(["GLOBAL", "ENTERPRISE", "TENANT", "ENTITY", "COUNTRY"]),
      classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
      version: z.string().min(1).max(40).default("1.0.0"),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      provenance: z.string().min(3).max(500),
      keywords: z.array(z.string().min(1).max(40)).max(30).default([]),
      taxLegalAuthority: TAX_LEGAL_AUTHORITY_INPUT.optional(),
    }).strict().parse(input);

    if (parsed.taxLegalAuthority) {
      if (parsed.domain !== "TAX" || !parsed.jurisdictionCode || !parsed.sourceUri) {
        throw new Error("Tax legal authority metadata requires TAX domain, jurisdiction and original source URI.");
      }
      const officialHosts = (process.env.TAX_OFFICIAL_SOURCE_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
      const tax = parsed.taxLegalAuthority;
      const candidate: TaxLegalAuthorityRecord = {
        sourceCode: parsed.code, title: parsed.title, jurisdictionCode: parsed.jurisdictionCode,
        instrumentKind: tax.instrumentKind as TaxInstrumentKind, sourceUri: parsed.sourceUri,
        sourceSha256: tax.originalSourceSha256, sourceAuthorityStatus: "AUTHORITATIVE",
        publishedOn: tax.publishedOn, commencedOn: tax.commencedOn, effectiveFrom: parsed.effectiveFrom,
        effectiveTo: tax.effectiveTo ?? null, officialSourceHost: tax.officialSourceHost,
        textValidatedAt: tax.textValidatedAt, textValidatedBy: tax.textValidatedBy,
        specialistReviewedAt: tax.specialistReviewedAt, specialistReviewerId: tax.specialistReviewerId,
        enablingProvision: tax.enablingProvision ?? null, amendsSourceCodes: tax.amendsSourceCodes,
        repealsSourceCodes: tax.repealsSourceCodes, supersedesSourceCodes: [],
        provisionReferences: tax.provisionReferences,
      };
      const authentication = authenticateTaxLegalSource(candidate, officialHosts);
      if (!authentication.authenticated) {
        return {
          headline: "Tax legal source rejected: authentication evidence is incomplete.",
          findings: authentication.reasons.map((reason) => ({ label: "Tax source authentication", value: reason, kind: "INFERENCE" as const, status: "REQUIRES_HUMAN_REVIEW" as const })),
          humanReviewRequired: true, confidence: 1,
        };
      }
    }

    const authorityTarget = parsed.scopeType === "GLOBAL"
      ? { tenantId: null, entityId: null, countryCode: null }
      : {
          tenantId: context.target.tenantId,
          entityId: parsed.scopeType === "ENTITY" ? context.target.legalEntityId : null,
          countryCode: parsed.scopeType === "COUNTRY" ? (parsed.jurisdictionCode ?? context.target.countryCode) : null,
        };
    const authority = can(context.principal, "ai:knowledge.ingest", authorityTarget);
    if (!authority.allowed || (parsed.scopeType === "ENTITY" && !context.target.legalEntityId) || (parsed.scopeType === "COUNTRY" && !authorityTarget.countryCode)) {
      return {
        headline: "Knowledge registration denied: complete scoped authority is required.",
        findings: [{ label: "Knowledge ingest", value: "SCOPE_DENIED", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 1,
      };
    }

    if (classificationRank(parsed.classification) > classificationRank(context.principal.clearance)) {
      return {
        headline: "Knowledge registration denied: classification exceeds the principal's clearance.",
        findings: [{
          label: "Knowledge ingest",
          value: "CLASSIFICATION_DENIED",
          kind: "INFERENCE",
          status: "REQUIRES_HUMAN_REVIEW",
        }],
        humanReviewRequired: true,
        confidence: 0.5,
      };
    }

    // Serialize duplicate-code admission before checking. The unique index is
    // the final database backstop; this lock keeps the common duplicate path a
    // deterministic governed denial instead of an unclassified constraint race.
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parsed.code}, 0))`);
    const [existing] = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.code, parsed.code))
      .limit(1);
    if (existing) {
      return {
        headline: "Knowledge registration denied: immutable code already exists.",
        findings: [{ label: "Knowledge ingest", value: "VERSION_CONFLICT", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 1,
      };
    }

    const id = newId(ID_PREFIX.knowledge);
    const contentDigest = checksumOf({
      code: parsed.code,
      version: parsed.version,
      scopeType: parsed.scopeType,
      classification: parsed.classification,
      content: parsed.content,
    });
    const row = {
      id,
      code: parsed.code,
      title: parsed.title,
      domain: parsed.domain,
      sourceUri: parsed.sourceUri ?? null,
      ownerRole: context.principal.roles[0] ?? "UNKNOWN",
      jurisdictionCode: parsed.jurisdictionCode ?? null,
      scopeType: parsed.scopeType,
      tenantId: parsed.scopeType === "GLOBAL" ? null : context.target.tenantId,
      legalEntityId: parsed.scopeType === "ENTITY" ? context.target.legalEntityId : null,
      countryCode: parsed.scopeType === "COUNTRY" ? (parsed.jurisdictionCode ?? context.target.countryCode) : null,
      version: parsed.version,
      authorityStatus: "UNDER_REVIEW" as const,
      provenance: parsed.provenance,
      classification: parsed.classification,
      effectiveFrom: parsed.effectiveFrom,
      reviewDate: parsed.reviewDate,
      expiresAt: parsed.expiresAt ?? null,
      supersedesCode: null,
      content: parsed.content,
      contentDigest,
      keywords: parsed.keywords,
      sourceType: parsed.taxLegalAuthority ? "TAX_LEGAL_AUTHORITY" : "GOVERNED_DOCUMENT",
      sourceAuthenticationStatus: parsed.taxLegalAuthority ? "SPECIALIST_REVIEWED" : "DISCOVERED",
      instrumentKind: parsed.taxLegalAuthority?.instrumentKind ?? null,
      publishedOn: parsed.taxLegalAuthority?.publishedOn ?? null,
      commencedOn: parsed.taxLegalAuthority?.commencedOn ?? null,
      effectiveTo: parsed.taxLegalAuthority?.effectiveTo ?? null,
      originalSourceSha256: parsed.taxLegalAuthority?.originalSourceSha256 ?? null,
      officialSourceHost: parsed.taxLegalAuthority?.officialSourceHost ?? null,
      textValidatedAt: parsed.taxLegalAuthority ? new Date(parsed.taxLegalAuthority.textValidatedAt + "T00:00:00.000Z") : null,
      textValidatedBy: parsed.taxLegalAuthority?.textValidatedBy ?? null,
      specialistReviewedAt: parsed.taxLegalAuthority ? new Date(parsed.taxLegalAuthority.specialistReviewedAt + "T00:00:00.000Z") : null,
      specialistReviewerId: parsed.taxLegalAuthority?.specialistReviewerId ?? null,
      enablingProvision: parsed.taxLegalAuthority?.enablingProvision ?? null,
      amendsSourceCodes: parsed.taxLegalAuthority?.amendsSourceCodes ?? [],
      repealsSourceCodes: parsed.taxLegalAuthority?.repealsSourceCodes ?? [],
      provisionReferences: parsed.taxLegalAuthority?.provisionReferences ?? [],
    };

    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.insert(knowledgeSources).values(row);
      await recordAuditTx(tx, {
        tenantId: context.target.tenantId,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        action: "ai.noelia.knowledge.ingest",
        objectType: "KNOWLEDGE_SOURCE",
        objectId: id,
        reason: `Knowledge source ${parsed.code} registered (${parsed.scopeType}/${parsed.classification}).`,
        aiVersion: NOELIA_IDENTITY,
        traceId: context.traceId,
        newValue: { code: parsed.code, domain: parsed.domain, authorityStatus: "UNDER_REVIEW", supersedesCode: null },
      });
      await publishEventTx(tx, {
        type: "NOELIA_KNOWLEDGE_INGESTED",
        source: "beyu-os/ai",
        domain: "KNOWLEDGE",
        operation: "INGEST",
        destinationDomain: null,
        tenantId: context.target.tenantId,
        legalEntityId: context.target.legalEntityId,
        subjectType: "KNOWLEDGE_SOURCE",
        subjectId: id,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        classification: parsed.classification,
        payload: { code: parsed.code, domain: parsed.domain, authorityStatus: "UNDER_REVIEW", supersedesCode: null },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: { authorityId: null, decisionId: null, capabilityCode: "cap-knowledge-ingest", permissionCode: "ai:knowledge.ingest", policyVersion: null },
        policyVersion: null,
      });
    });

    return {
      headline: `Knowledge source ${parsed.code} registered.`,
      findings: [{
        label: "Knowledge source",
        value: `${parsed.code} · ${parsed.scopeType} · ${"UNDER_REVIEW"} · effective ${parsed.effectiveFrom}`,
        kind: "FACT",
        status: "OBSERVED",
      }],
      sources: [{
        kind: "KNOWLEDGE_SOURCE",
        ref: parsed.code,
        label: parsed.title,
        authority: "UNDER_REVIEW",
      }],
      metadata: { knowledgeSourceId: id, supersedesCode: null },
      confidence: 0.9,
    };
  }

  async prepareReplacement(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const parsed = z.object({
      supersedesCode: z.string().min(3).max(64),
      expectedDigest: z.string().length(64),
      expectedVersion: z.string().min(1).max(40),
      replacement: z.record(z.unknown()),
    }).strict().parse(input);
    // Lock the exact predecessor before validating it. This serializes
    // replacement preparation with publication/supersession and prevents a
    // stale authoritative observation from authorizing a new branch.
    await db.execute(sql`select id from knowledge_sources where code = ${parsed.supersedesCode} for update`);
    const [current] = await db.select().from(knowledgeSources)
      .where(eq(knowledgeSources.code, parsed.supersedesCode)).limit(1);
    if (!current || current.contentDigest !== parsed.expectedDigest || current.version !== parsed.expectedVersion || current.authorityStatus !== "AUTHORITATIVE") {
      return {
        headline: "Knowledge replacement denied: authoritative source version/digest mismatch.",
        findings: [{ label: "Knowledge replacement", value: "DIGEST_VERSION_MISMATCH", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 1,
      };
    }
    const [activeReplacement] = await db.select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.supersedesCode, parsed.supersedesCode),
        inArray(knowledgeSources.authorityStatus, ["UNDER_REVIEW", "AUTHORITATIVE"]),
      ))
      .limit(1);
    if (activeReplacement) {
      return {
        headline: "Knowledge replacement denied: an active replacement already binds this predecessor.",
        findings: [{ label: "Knowledge replacement", value: "ACTIVE_REPLACEMENT_EXISTS", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 1,
      };
    }
    const replacementCode = typeof parsed.replacement.code === "string" ? parsed.replacement.code : "";
    if (!replacementCode || replacementCode === parsed.supersedesCode) {
      throw new Error("A replacement requires a new immutable knowledge code.");
    }
    const result = await this.ingestKnowledge(context, parsed.replacement);
    const replacementId = result.metadata?.knowledgeSourceId;
    if (typeof replacementId !== "string") return result;
    const bound = await db.update(knowledgeSources).set({ supersedesCode: parsed.supersedesCode })
      .where(and(eq(knowledgeSources.id, replacementId), eq(knowledgeSources.authorityStatus, "UNDER_REVIEW")))
      .returning({ id: knowledgeSources.id });
    if (bound.length !== 1) throw new Error("Knowledge replacement binding was not committed exactly once.");
    return {
      ...result,
      headline: `Replacement ${replacementCode} registered UNDER_REVIEW; ${parsed.supersedesCode} remains authoritative until separately published.`,
      metadata: { ...(result.metadata ?? {}), supersedesCode: parsed.supersedesCode },
    };
  }

  async publishKnowledge(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const parsed = z.object({
      code: z.string().min(3).max(64),
      expectedDigest: z.string().length(64),
      expectedVersion: z.string().min(1).max(40),
      expectedSupersededDigest: z.string().length(64).optional(),
      expectedSupersededVersion: z.string().min(1).max(40).optional(),
    }).strict().parse(input);
    // Re-read only after acquiring a row lock. Concurrent publication or
    // replacement transitions must observe the winner's committed state and
    // fail closed rather than both reporting success from stale snapshots.
    await db.execute(sql`select id from knowledge_sources where code = ${parsed.code} for update`);
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, parsed.code)).limit(1);
    const recomputed = source ? checksumOf({
      code: source.code,
      version: source.version,
      scopeType: source.scopeType,
      classification: source.classification,
      content: source.content,
    }) : null;
    if (
      !source ||
      source.authorityStatus !== "UNDER_REVIEW" ||
      source.version !== parsed.expectedVersion ||
      source.contentDigest !== parsed.expectedDigest ||
      recomputed !== parsed.expectedDigest
    ) {
      return {
        headline: "Knowledge publication denied: UNDER_REVIEW source version/digest mismatch.",
        findings: [{ label: "Knowledge publication", value: "DIGEST_VERSION_MISMATCH", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 1,
      };
    }
    const authorityTarget = source.scopeType === "GLOBAL"
      ? { tenantId: null, entityId: null, countryCode: null }
      : { tenantId: source.tenantId, entityId: source.legalEntityId, countryCode: source.countryCode };
    if (!can(context.principal, "ai:knowledge.ingest", authorityTarget).allowed) {
      throw new Error("Knowledge publication requires one live authority tuple matching the source scope.");
    }

    if (source.sourceType === "TAX_LEGAL_AUTHORITY") {
      const officialHosts = (process.env.TAX_OFFICIAL_SOURCE_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
      const dateOnly = (value: Date | null): string | null => value ? value.toISOString().slice(0, 10) : null;
      const candidate: TaxLegalAuthorityRecord = {
        sourceCode: source.code, title: source.title, jurisdictionCode: source.jurisdictionCode ?? "",
        instrumentKind: (source.instrumentKind ?? "OTHER") as TaxInstrumentKind, sourceUri: source.sourceUri,
        sourceSha256: source.originalSourceSha256, sourceAuthorityStatus: "AUTHORITATIVE",
        publishedOn: source.publishedOn, commencedOn: source.commencedOn, effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo, officialSourceHost: source.officialSourceHost,
        textValidatedAt: dateOnly(source.textValidatedAt), textValidatedBy: source.textValidatedBy,
        specialistReviewedAt: dateOnly(source.specialistReviewedAt), specialistReviewerId: source.specialistReviewerId,
        enablingProvision: source.enablingProvision, amendsSourceCodes: source.amendsSourceCodes ?? [],
        repealsSourceCodes: source.repealsSourceCodes ?? [], supersedesSourceCodes: source.supersedesCode ? [source.supersedesCode] : [],
        provisionReferences: source.provisionReferences ?? [],
      };
      const authentication = authenticateTaxLegalSource(candidate, officialHosts);
      if (source.sourceAuthenticationStatus !== "SPECIALIST_REVIEWED" || !authentication.authenticated) {
        return {
          headline: "Tax legal publication denied: authenticated original-source evidence and specialist review are required.",
          findings: (source.sourceAuthenticationStatus !== "SPECIALIST_REVIEWED" ? ["Source has not completed specialist review."] : []).concat(authentication.reasons).map((reason) => ({ label: "Tax authority gate", value: reason, kind: "INFERENCE" as const, status: "REQUIRES_HUMAN_REVIEW" as const })),
          humanReviewRequired: true, confidence: 1,
        };
      }
    }

    let superseded: typeof source | null = null;
    if (source.supersedesCode) {
      await db.execute(sql`select id from knowledge_sources where code = ${source.supersedesCode} for update`);
      [superseded] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, source.supersedesCode)).limit(1);
      if (
        !superseded ||
        superseded.authorityStatus !== "AUTHORITATIVE" ||
        !parsed.expectedSupersededDigest ||
        !parsed.expectedSupersededVersion ||
        superseded.contentDigest !== parsed.expectedSupersededDigest ||
        superseded.version !== parsed.expectedSupersededVersion ||
        checksumOf({ code: superseded.code, version: superseded.version, scopeType: superseded.scopeType, classification: superseded.classification, content: superseded.content }) !== parsed.expectedSupersededDigest
      ) {
        return {
          headline: "Knowledge publication denied: replacement target version/digest mismatch.",
          findings: [{ label: "Knowledge publication", value: "SUPERSEDED_DIGEST_MISMATCH", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
          humanReviewRequired: true,
          confidence: 1,
        };
      }
    }

    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      if (superseded) {
        const predecessorTransition = await tx.update(knowledgeSources).set({ authorityStatus: "SUPERSEDED" })
          .where(and(
            eq(knowledgeSources.id, superseded.id),
            eq(knowledgeSources.contentDigest, parsed.expectedSupersededDigest!),
            eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
          ))
          .returning({ id: knowledgeSources.id });
        if (predecessorTransition.length !== 1) throw new Error("Knowledge predecessor was not superseded exactly once.");
      }
      const publication = await tx.update(knowledgeSources).set({ authorityStatus: "AUTHORITATIVE", ...(source.sourceType === "TAX_LEGAL_AUTHORITY" ? { sourceAuthenticationStatus: "AUTHORITATIVE" } : {}) })
        .where(and(eq(knowledgeSources.id, source.id), eq(knowledgeSources.contentDigest, parsed.expectedDigest), eq(knowledgeSources.authorityStatus, "UNDER_REVIEW")))
        .returning({ id: knowledgeSources.id });
      if (publication.length !== 1) throw new Error("Knowledge source was not published exactly once.");
      await recordAuditTx(tx, {
        tenantId: source.tenantId,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        action: "ai.noelia.knowledge.publish",
        objectType: "KNOWLEDGE_SOURCE",
        objectId: source.id,
        reason: `Knowledge ${source.code}@${source.version} published after bound digest approval.`,
        approvalRef: context.approval?.approvalId,
        aiVersion: NOELIA_IDENTITY,
        traceId: context.traceId,
        newValue: { code: source.code, version: source.version, digest: parsed.expectedDigest, supersedesCode: source.supersedesCode },
      });
    });
    return {
      headline: `Knowledge source ${source.code}@${source.version} is AUTHORITATIVE.`,
      findings: [{ label: "Knowledge publication", value: parsed.expectedDigest, kind: "FACT", status: "OBSERVED" }],
      sources: [{ kind: "KNOWLEDGE_SOURCE", ref: source.code, label: source.title, authority: "AUTHORITATIVE" }],
      metadata: { knowledgeSourceId: source.id, digest: parsed.expectedDigest, supersedesCode: source.supersedesCode },
      confidence: 1,
    };
  }

  async write(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const parsed = z.object({
      memoryClass: z.string().min(3).max(60),
      content: z.string().min(5).max(10000),
      classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
      legalEntityId: z.string().nullable().optional(),
      countryCode: z.string().length(2).nullable().optional(),
      expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      retentionCode: z.string().min(2).max(40).default("STANDARD"),
      legalHold: z.boolean().default(false),
      metadata: z.record(z.unknown()).default({}),
    }).strict().parse(input);

    if (!(MEMORY_CLASSES as readonly string[]).includes(parsed.memoryClass)) {
      return {
        headline: "Memory write denied: unknown memory class.",
        findings: [{ label: "Memory write", value: "CLASS_UNKNOWN", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 0.5,
      };
    }
    if (classificationRank(parsed.classification) > classificationRank(context.principal.clearance)) {
      return {
        headline: "Memory write denied: classification exceeds the principal's clearance.",
        findings: [{ label: "Memory write", value: "CLASSIFICATION_DENIED", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 0.5,
      };
    }
    if (parsed.legalEntityId && !context.scope.legalEntityIds.includes(parsed.legalEntityId)) {
      return {
        headline: "Memory write denied: legal entity is outside the resolved scope.",
        findings: [{ label: "Memory write", value: "ENTITY_DENIED", kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" }],
        humanReviewRequired: true,
        confidence: 0.5,
      };
    }

    const id = newId(ID_PREFIX.knowledge);
    const today = new Date().toISOString().slice(0, 10);
    const scopeType: MemoryScopeType = parsed.legalEntityId
      ? "ENTITY"
      : parsed.countryCode
        ? "COUNTRY"
        : "TENANT";
    const row = {
      id,
      tenantId: context.target.tenantId,
      ownerUserId: context.principal.userId,
      memoryClass: parsed.memoryClass,
      content: parsed.content,
      classification: parsed.classification as Classification,
      scopeType,
      legalEntityId: parsed.legalEntityId ?? null,
      countryCode: parsed.countryCode ?? null,
      provenance: `noelia-memory/principal/${context.principal.userId}`,
      confidence: null,
      retentionCode: parsed.retentionCode,
      legalHold: parsed.legalHold,
      effectiveFrom: today,
      expiresAt: parsed.expiresAt ?? null,
      supersedesId: null,
      status: "ACTIVE",
      metadata: parsed.metadata,
      createdBy: context.principal.userId,
    };

    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.insert(enterpriseMemory).values(row);
      await recordAuditTx(tx, {
        tenantId: context.target.tenantId,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        action: "ai.noelia.memory.write",
        objectType: "ENTERPRISE_MEMORY",
        objectId: id,
        reason: `Enterprise memory written (${parsed.memoryClass}/${parsed.classification}).`,
        aiVersion: NOELIA_IDENTITY,
        traceId: context.traceId,
        newValue: { memoryClass: parsed.memoryClass, classification: parsed.classification, scopeType },
      });
      await publishEventTx(tx, {
        type: "NOELIA_MEMORY_WRITTEN",
        source: "beyu-os/ai",
        domain: "MEMORY",
        operation: "WRITE",
        destinationDomain: null,
        tenantId: context.target.tenantId,
        legalEntityId: context.target.legalEntityId,
        subjectType: "ENTERPRISE_MEMORY",
        subjectId: id,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        classification: parsed.classification,
        payload: { memoryClass: parsed.memoryClass, scopeType },
        traceId: context.traceId,
        correlationId: context.traceId,
        causationId: null,
        authorityContext: { authorityId: null, decisionId: null, capabilityCode: "cap-memory-write", permissionCode: "ai:memory.write", policyVersion: null },
        policyVersion: null,
      });
    });

    return {
      headline: "Enterprise memory written.",
      findings: [{
        label: "Memory",
        value: `${parsed.memoryClass} · ${parsed.classification} · expires ${parsed.expiresAt ?? "never"}`,
        kind: "FACT",
        status: "OBSERVED",
      }],
      metadata: { memoryId: id },
      confidence: 0.9,
    };
  }

  async search(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const parsed = z.object({
      query: z.string().min(1).max(500),
      memoryClass: z.string().max(60).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }).strict().parse(input ?? {});
    const today = new Date().toISOString().slice(0, 10);
    const classifications = CLASSIFICATION_ORDER.filter(
      (classification) => classificationRank(classification) <= classificationRank(context.principal.clearance),
    );
    const terms = parsed.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const rows = await db
      .select()
      .from(enterpriseMemory)
      .where(and(
        eq(enterpriseMemory.status, "ACTIVE"),
        inArray(enterpriseMemory.tenantId, context.scope.tenantIds),
        inArray(enterpriseMemory.classification, classifications),
        lte(enterpriseMemory.effectiveFrom, today),
        sql`(${enterpriseMemory.expiresAt} is null or ${enterpriseMemory.expiresAt} >= ${today})`,
        parsed.memoryClass ? eq(enterpriseMemory.memoryClass, parsed.memoryClass) : sql`true`,
        terms.length ? sql`lower(${enterpriseMemory.content}) ~ ${terms.join("|")}` : sql`true`,
      ))
      .orderBy(desc(enterpriseMemory.createdAt))
      .limit(parsed.limit);

    const visible = rows.filter((row) =>
      decideMemoryClassVisibility(
        { clearance: context.principal.clearance },
        context.scope,
        {
          tenantId: row.tenantId,
          legalEntityId: row.legalEntityId,
          countryCode: row.countryCode,
          classification: row.classification,
          status: row.status,
          effectiveFrom: String(row.effectiveFrom),
          expiresAt: row.expiresAt ? String(row.expiresAt) : null,
          ownerUserId: row.ownerUserId,
          memoryClass: row.memoryClass,
        },
        today,
        context.principal.userId,
      ).allowed);

    if (visible.length === 0) {
      return {
        headline: "No enterprise memory matched within the authorized scope.",
        findings: [{
          label: "Memory search",
          value: "NO_MATCH",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        confidence: 0.4,
      };
    }
    return {
      headline: `${visible.length} enterprise memory record(s) retrieved.`,
      findings: visible.map((row) => ({
        label: `${row.memoryClass} memory · ${row.id}`,
        value: row.content.slice(0, 160),
        kind: "FACT",
        status: "OBSERVED",
        provenance: `ENTERPRISE_MEMORY:${row.id}`,
      })),
      metadata: {
        records: visible.map((row) => ({
          id: row.id,
          memoryClass: row.memoryClass,
          classification: row.classification,
          content: row.content.slice(0, 500),
          createdAt: row.createdAt.toISOString(),
          legalHold: row.legalHold,
        })),
      },
      narrative: "Memory is NOT authority: it cannot override current authoritative data or policy, and stale or superseded memory is never retrieved as current.",
      confidence: 0.7,
    };
  }
}
