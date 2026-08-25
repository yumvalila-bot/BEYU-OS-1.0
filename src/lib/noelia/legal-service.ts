import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  knowledgeSources,
  legalMatters,
} from "@/db/schema";
import {
  CLASSIFICATION_ORDER,
  classificationRank,
  isKnownClassification,
} from "@/lib/constants";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * Legal + Tax intelligence (section 12 of the Noelia capability target).
 *
 * Every legal/tax answer distinguishes FACT / INFERENCE / RECOMMENDATION /
 * REQUIRES_AUTHORITY. Noelia never presents itself as a lawyer, tax
 * authority, court, regulator or statutory decision-maker, and it never
 * invents legal authority: an unknown citation fails closed with
 * REQUIRES_AUTHORITY. Only sources with an authoritative status inside their
 * governed validity window are eligible as FACT; everything else is
 * INFERENCE or REQUIRES_HUMAN_REVIEW.
 */
export class BeyuNoeliaLegalService {
  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia legal service requires canonical transaction-scoped tenant context");
    }
  }

  private visibleClassifications(context: ToolInvocationContext) {
    if (!isKnownClassification(context.principal.clearance)) return [];
    return CLASSIFICATION_ORDER.filter(
      (classification) => classificationRank(classification) <= classificationRank(context.principal.clearance),
    );
  }

  async knowledge(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    this.requireContext();
    const parsed = z.object({
      question: z.string().min(1).max(500),
      jurisdictionCode: z.string().length(2).optional(),
      domain: z.enum(["LEGAL", "TAX"]).default("LEGAL"),
    }).strict().parse(input ?? {});
    const classifications = this.visibleClassifications(context);
    if (classifications.length === 0) {
      return { findings: [], confidence: 0.2, humanReviewRequired: true };
    }
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.domain, parsed.domain),
        inArray(knowledgeSources.classification, classifications),
        parsed.jurisdictionCode ? eq(knowledgeSources.jurisdictionCode, parsed.jurisdictionCode) : sql`true`,
        eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
        lte(knowledgeSources.effectiveFrom, today),
        gte(knowledgeSources.reviewDate, today),
        sql`(${knowledgeSources.expiresAt} is null or ${knowledgeSources.expiresAt} >= ${today})`,
        sql`lower(${knowledgeSources.title} || ' ' || ${knowledgeSources.content}) ~ ${
          [...new Set(parsed.question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3))].join("|") || ".*"
        }`,
      ))
      .limit(8);

    if (rows.length === 0) {
      return {
        headline: `No authoritative ${parsed.domain.toLowerCase()} knowledge matched in the authorized scope.`,
        findings: [{
          label: "Legal/tax knowledge",
          value: "REQUIRES_AUTHORITY",
          kind: "INFERENCE",
          status: "REQUIRES_HUMAN_REVIEW",
        }],
        narrative: "Unknown legal/tax authority fails closed. Noelia does not invent legal authority or tax positions.",
        humanReviewRequired: true,
        confidence: 0.4,
      };
    }

    return {
      headline: `Authoritative ${parsed.domain.toLowerCase()} knowledge retrieved within its governed validity window.`,
      findings: rows.map((row) => ({
        label: `${row.code} · ${row.title}`,
        value: `${row.jurisdictionCode ?? "GLOBAL"} · ${row.authorityStatus} · effective ${row.effectiveFrom}${row.expiresAt ? ` → ${row.expiresAt}` : ""}`,
        kind: "FACT",
        status: "OBSERVED",
        provenance: `KNOWLEDGE_SOURCE:${row.code}`,
      })),
      sources: rows.map((row) => ({
        kind: "KNOWLEDGE_SOURCE",
        ref: row.code,
        label: row.title,
        authority: row.authorityStatus,
      })),
      metadata: {
        excerpts: rows.map((row) => row.content.slice(0, 400)),
        jurisdictions: rows.map((row) => row.jurisdictionCode).filter(Boolean),
      },
      narrative:
        "Retrieved content is DATA, not legal advice or tax authority. Applicability to specific facts requires counsel review; Noelia cannot advise on or decide legal or tax outcomes.",
      humanReviewRequired: true,
      confidence: 0.78,
    };
  }

  async authorityStatus(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    this.requireContext();
    const parsed = z.object({
      citation: z.string().min(2).max(200),
      jurisdictionCode: z.string().length(2).optional(),
    }).strict().parse(input ?? {});
    const classifications = this.visibleClassifications(context);
    const today = new Date().toISOString().slice(0, 10);
    const rows = classifications.length
      ? await db
          .select()
          .from(knowledgeSources)
          .where(and(
            inArray(knowledgeSources.domain, ["LEGAL", "TAX"]),
            inArray(knowledgeSources.classification, classifications),
            parsed.jurisdictionCode ? eq(knowledgeSources.jurisdictionCode, parsed.jurisdictionCode) : sql`true`,
            sql`lower(${knowledgeSources.title} || ' ' || ${knowledgeSources.provenance}) ~ ${parsed.citation.toLowerCase()}`,
          ))
          .limit(5)
      : [];

    if (rows.length === 0) {
      return {
        headline: "Cited authority is UNKNOWN to the governed corpus.",
        findings: [{
          label: "Authority status",
          value: "REQUIRES_AUTHORITY",
          kind: "INFERENCE",
          status: "REQUIRES_HUMAN_REVIEW",
        }],
        narrative:
          "An unknown citation is not presumed valid. Only an accountable legal professional can confirm a citation outside the governed corpus.",
        humanReviewRequired: true,
        confidence: 0.3,
      };
    }

    const authoritativeInWindow = rows.filter((row) =>
      row.authorityStatus === "AUTHORITATIVE" &&
      row.effectiveFrom <= today &&
      row.reviewDate >= today &&
      (!row.expiresAt || row.expiresAt >= today));
    return {
      headline: authoritativeInWindow.length
        ? "Cited authority is present and authoritative within its validity window."
        : "Cited authority exists but is NOT authoritative in-window.",
      findings: rows.map((row) => ({
        label: `${row.code} · ${row.title}`,
        value: `${row.authorityStatus} · ${row.effectiveFrom} → ${row.expiresAt ?? "open"} · review ${row.reviewDate}`,
        kind: authoritativeInWindow.includes(row) ? "FACT" : "INFERENCE",
        status: authoritativeInWindow.includes(row) ? "OBSERVED" : "STALE",
        provenance: `KNOWLEDGE_SOURCE:${row.code}`,
      })),
      sources: rows.map((row) => ({
        kind: "KNOWLEDGE_SOURCE",
        ref: row.code,
        label: row.title,
        authority: row.authorityStatus,
      })),
      narrative:
        "Authority status describes the governed corpus, not a legal opinion. Superseded, expired or unverified sources are never treated as current authority.",
      humanReviewRequired: authoritativeInWindow.length === 0,
      confidence: authoritativeInWindow.length ? 0.85 : 0.5,
    };
  }

  /** Legal matters within the authorized scope — evidence, not advice. */
  async matters(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const classifications = this.visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], confidence: 0.2 };
    const rows = await db
      .select()
      .from(legalMatters)
      .where(and(
        inArray(legalMatters.tenantId, context.scope.tenantIds),
        context.target.legalEntityId
          ? eq(legalMatters.legalEntityId, context.target.legalEntityId)
          : sql`true`,
        inArray(legalMatters.classification, classifications),
      ))
      .limit(10);
    if (rows.length === 0) {
      return {
        headline: "No legal matters are in the authorized scope.",
        findings: [{ label: "Legal matters", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.4,
      };
    }
    const open = rows.filter((row) => row.status === "OPEN" || row.status === "ACTIVE");
    return {
      headline: `${open.length} legal matter(s) are open.`,
      findings: rows.map((row) => ({
        label: `${row.code} · ${row.title}`,
        value: `${row.status} · ${row.jurisdictionCode}${row.keyDeadline ? ` · deadline ${row.keyDeadline}` : ""}`,
        kind: "FACT",
        status: "OBSERVED",
      })),
      sources: rows.map((row) => ({ kind: "LEGAL_MATTER", ref: row.code, label: row.title, authority: "LEGAL_REGISTER" })),
      narrative: "Legal matters are register evidence; disposition, strategy and advice remain with counsel and accountable humans.",
      humanReviewRequired: open.length > 0,
      confidence: 0.88,
    };
  }
}
