import { eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources, noeliaRagRetrievalEvents } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { checksumOf, sha256 } from "@/lib/crypto";
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
  return checksumOf(input);
}

export class BeyuNoeliaKnowledgeFabric {
  /**
   * Direct mutation was intentionally removed. Knowledge registration,
   * replacement and authoritative publication are HIGH-risk Noelia actions and
   * must pass request → exact-role human approval → execution in actions.ts.
   */
  async registerDocument(_input: KnowledgeDocumentInput): Promise<never> {
    throw new Error("DIRECT_KNOWLEDGE_MUTATION_REMOVED: use the governed knowledge.ingest action");
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
