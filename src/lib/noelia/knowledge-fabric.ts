import { eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources, noeliaRagRetrievalEvents } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { sha256 } from "@/lib/crypto";
import { ID_PREFIX, newId } from "@/lib/ids";
import { recordAuditTx, type Tx } from "@/lib/audit";
import type { NoeliaAuthorizedScope, NoeliaTargetContext, NoeliaSource } from "./types";
import { type KnowledgeScopeType, retrieveGovernedMemory } from "./memory";

/**
 * Phase 5 RAG / Knowledge Fabric.
 *
 * This layer:
 *  - adds content digest and embedding/index metadata to governed knowledge,
 *  - keeps authorization before context assembly,
 *  - records retrieval audit without persisting retrieved content,
 *  - never treats vector similarity or retrieval as authorization.
 */

export type KnowledgeDocumentInput = {
  principal: Principal;
  traceId: string;
  code: string;
  title: string;
  domain: string;
  sourceUri?: string | null;
  osId?: string | null;
  sourceType?: string;
  ownerRole: string;
  jurisdictionCode?: string | null;
  scopeType: KnowledgeScopeType;
  tenantId?: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  version?: string;
  authorityStatus?: "AUTHORITATIVE" | "UNDER_REVIEW" | "SUPERSEDED" | "EXPIRED" | "REJECTED";
  provenance: string;
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
  effectiveFrom: string;
  reviewDate: string;
  expiresAt?: string | null;
  content: string;
  keywords?: string[];
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia knowledge fabric requires canonical transaction-scoped tenant context");
}

function requireWrite(principal: Principal): void {
  const decision = can(principal, "ai:knowledge.ingest");
  if (!decision.allowed) throw new Error(`Knowledge fabric permission denied: ${decision.reason}`);
}

function requireRead(principal: Principal): void {
  const decision = can(principal, "ai:noelia.query");
  if (!decision.allowed) throw new Error(`Knowledge fabric read denied: ${decision.reason}`);
}

export function computeKnowledgeDigest(input: { code: string; version: string; content: string; scopeType: string; classification: string }): string {
  return sha256(`${input.code}|${input.version}|${input.scopeType}|${input.classification}|${input.content}`);
}

export class BeyuNoeliaKnowledgeFabric {
  async registerDocument(input: KnowledgeDocumentInput): Promise<{ id: string; digest: string; embeddingStatus: string }> {
    requireContext();
    requireWrite(input.principal);
    const version = input.version ?? "1.0.0";
    const authorityStatus = (input.authorityStatus ?? "UNDER_REVIEW") as "AUTHORITATIVE" | "UNDER_REVIEW" | "SUPERSEDED" | "EXPIRED" | "REJECTED";
    const digest = computeKnowledgeDigest({
      code: input.code,
      version,
      content: input.content,
      scopeType: input.scopeType,
      classification: input.classification,
    });
    const embeddingStatus = "NOT_EMBEDDED"; // Real embeddings are ENVIRONMENT_LIMITED until a real embedding runtime is mounted.
    const values = {
      id: newId(ID_PREFIX.knowledge),
      code: input.code,
      title: input.title,
      domain: input.domain,
      sourceUri: input.sourceUri ?? null,
      ownerRole: input.ownerRole,
      jurisdictionCode: input.jurisdictionCode ?? null,
      scopeType: input.scopeType,
      tenantId: input.tenantId ?? null,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      version,
      authorityStatus,
      provenance: input.provenance,
      classification: input.classification,
      effectiveFrom: input.effectiveFrom,
      reviewDate: input.reviewDate,
      expiresAt: input.expiresAt ?? null,
      content: input.content,
      keywords: input.keywords ?? [],
      contentDigest: digest,
      sourceType: input.sourceType ?? "GOVERNED_DOCUMENT",
      osId: input.osId ?? null,
      embeddingStatus,
      chunkCount: 0,
      lastIndexedAt: null,
    };
    await db
      .insert(knowledgeSources)
      .values(values)
      .onConflictDoUpdate({
        target: knowledgeSources.code,
        set: {
          title: values.title,
          domain: values.domain,
          sourceUri: values.sourceUri,
          ownerRole: values.ownerRole,
          jurisdictionCode: values.jurisdictionCode,
          scopeType: values.scopeType,
          tenantId: values.tenantId,
          legalEntityId: values.legalEntityId,
          countryCode: values.countryCode,
          version: values.version,
          authorityStatus: values.authorityStatus,
          provenance: values.provenance,
          classification: values.classification,
          effectiveFrom: values.effectiveFrom,
          reviewDate: values.reviewDate,
          expiresAt: values.expiresAt,
          content: values.content,
          keywords: values.keywords,
          contentDigest: values.contentDigest,
          sourceType: values.sourceType,
          osId: values.osId,
          embeddingStatus: values.embeddingStatus,
          chunkCount: values.chunkCount,
          lastIndexedAt: values.lastIndexedAt,
        },
      });
    await recordAuditTx(db as unknown as Tx, {
      actorUserId: input.principal.userId,
      actorType: "HUMAN",
      action: "NOELIA_KNOWLEDGE_FABRIC_REGISTERED",
      objectType: "KNOWLEDGE_SOURCE",
      objectId: values.id,
      reason: "Register Phase 5 governed knowledge document.",
      authority: "AI_KNOWLEDGE_FABRIC",
      policyVersion: "ai.knowledge.phase5.2026.09",
      aiVersion: "noelia.phase5",
      oldValue: null,
      newValue: { code: input.code, scopeType: input.scopeType, digest, embeddingStatus, osId: input.osId ?? null },
      traceId: input.traceId,
    });
    return { id: values.id, digest, embeddingStatus };
  }

  async verifyDigest(input: { principal: Principal; traceId: string; code: string }): Promise<{ valid: boolean; stored: string; recomputed: string | null }> {
    requireContext();
    requireRead(input.principal);
    const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, input.code)).limit(1);
    if (!row) throw new Error("Knowledge document not found.");
    const recomputed = computeKnowledgeDigest({
      code: row.code,
      version: row.version,
      content: row.content,
      scopeType: row.scopeType,
      classification: row.classification,
    });
    return {
      valid: Boolean(row.contentDigest && row.contentDigest === recomputed),
      stored: row.contentDigest ?? "",
      recomputed,
    };
  }

  async retrieve(input: {
    principal: Principal;
    traceId: string;
    scope: NoeliaAuthorizedScope;
    target: NoeliaTargetContext;
    osId?: string | null;
    question: string;
    limit?: number;
  }): Promise<Array<NoeliaSource & { excerpt: string; classification: string; scopeType: string }>> {
    requireContext();
    requireRead(input.principal);
    const retrieved = await retrieveGovernedMemory({
      principal: input.principal,
      scope: input.scope,
      question: input.question,
      limit: input.limit ?? 4,
    });
    for (let i = 0; i < retrieved.length; i += 1) {
      const record = retrieved[i];
      const id = newId(ID_PREFIX.ragEvent);
      await db.insert(noeliaRagRetrievalEvents).values({
        id,
        requestId: input.traceId,
        traceId: input.traceId,
        sourceCode: record.source.ref,
        tenantId: input.scope.tenantIds[0] ?? null,
        countryCode: input.target.countryCode ?? null,
        osId: input.osId ?? null,
        authorizationDecision: "ALLOWED",
        excerptHash: sha256(record.excerpt).slice(0, 64),
        retrievalRank: i + 1,
      });
    }
    return retrieved.map((r) => ({ ...r.source, excerpt: r.excerpt, classification: r.classification, scopeType: r.scopeType }));
  }
}
