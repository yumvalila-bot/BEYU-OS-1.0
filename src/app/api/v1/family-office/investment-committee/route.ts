import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { db } from "@/db";
import * as s from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { withAuditTransaction } from "@/lib/audit";
import { listCommitteeDecisions } from "@/lib/family-office-capital-service";
import { validateCommitteeDecision } from "@/lib/family/office/capital-wealth";

export const dynamic = "force-dynamic";

const VoteSchema = z
  .object({
    memberRef: z.string().trim().min(1).max(200),
    /** The role the member sat in. Identity is not role, and role is not authority. */
    role: z.string().trim().min(1).max(200),
    position: z.enum(["FOR", "AGAINST", "ABSTAIN", "ABSENT"]),
    /** Required for AGAINST: dissent must be recorded, not counted silently. */
    dissentReason: z.string().trim().max(2000).nullish(),
  })
  .strict();

const DecisionSchema = z
  .object({
    allocationId: z.string().trim().min(1),
    decision: z.enum(["APPROVE", "APPROVE_WITH_CONDITIONS", "REJECT", "DEFER", "REQUEST_INFORMATION"]),
    /** The body that decided. A decision with no body has no authority. */
    bodyRef: z.string().trim().min(1).max(200),
    members: z.array(VoteSchema).min(1),
    quorumMinimum: z.number().int().positive(),
    majorityRule: z.enum(["SIMPLE", "TWO_THIRDS", "UNANIMOUS", "CHAIR_CASTING"]),
    decisionDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(4000),
    conditions: z.array(z.string().trim().max(2000)).default([]),
    followUps: z.array(z.object({ action: z.string().trim().min(1).max(2000), ownerRef: z.string().trim().min(1).max(200), dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()).default([]),
    /** The resolution or approval instrument behind the decision. */
    authorityRef: z.string().trim().max(200).nullish(),
    requesterRef: z.string().trim().min(1).max(200),
    executorRef: z.string().trim().max(200).nullish(),
    reconcilerRef: z.string().trim().max(200).nullish(),
  })
  .strict();

/**
 * GET /api/v1/family-office/investment-committee
 *
 * The committee decision log (§21): every decision with its votes, quorum,
 * majority rule, conditions and the authority instrument behind it.
 *
 * Each decision is re-validated on read. Quorum and majority are recomputed from
 * the recorded votes rather than trusted from a stored flag, so a decision whose
 * arithmetic does not hold is surfaced even if it was written some other way.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:committee.read", action: "family.committee.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_COMMITTEE_DECISION" } },
    async (ctx) => {
      const { decisions, total } = await listCommitteeDecisions(ctx.principal);
      return apiOk(
        {
          decisions: decisions.map((row) => {
            const votes = (row.members as { memberRef: string; role: string; position: string; dissentReason: string | null }[] | null) ?? [];
            const findings = validateCommitteeDecision({
              id: row.id,
              tenantId: row.tenantId,
              allocationId: row.allocationId ?? "",
              decision: row.decision as never,
              bodyRef: row.bodyRef,
              members: votes as never,
              quorumMinimum: row.quorumMinimum,
              majorityRule: row.majorityRule as never,
              date: row.decisionDate,
              reason: row.reason,
              conditions: (row.conditions as string[] | null) ?? [],
              followUps: (row.followUps as { action: string; ownerRef: string; dueDate: string }[] | null) ?? [],
              authorityRef: row.authorityRef,
              decidedByActorType: row.decidedByActorType as never,
              requesterRef: row.requesterRef,
              executorRef: row.executorRef,
              reconcilerRef: row.reconcilerRef,
            });
            return { ...row, votes, validation: { ok: findings.length === 0, findings } };
          }),
          total,
          /** Approvals with no authority instrument behind them (§42). */
          unauthorisedApprovals: decisions
            .filter((d) => (d.decision === "APPROVE" || d.decision === "APPROVE_WITH_CONDITIONS") && !d.authorityRef)
            .map((d) => ({ id: d.id, allocationId: d.allocationId, decision: d.decision })),
        },
        ctx.traceId,
      );
    },
  );
}

/**
 * POST /api/v1/family-office/investment-committee
 *
 * Records a committee decision, gated by `familyoffice:committee.decide` — a
 * `HIGH_RISK_PERMISSION` requiring MFA step-up.
 *
 * Two checks run before anything is written:
 *   1. The actor may not be the requester of the allocation being decided (§39).
 *      A committee that approves its own requests has one vote, not several.
 *   2. The decision must pass the engine's quorum and majority validation. A
 *      decision that fails is refused, not stored and flagged later — a void
 *      decision in the log is worse than a rejected one.
 *
 * The engine returns findings; it does not throw. Findings are therefore mapped
 * to a 422 here rather than relied on as an exception.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:committee.decide", action: "family.committee.decide", rateLimit: { limit: 20, windowMs: 60_000 }, audit: { objectType: "FAMILY_COMMITTEE_DECISION" }, databaseContext: "handler" },
    async (ctx) => {
      const body = DecisionSchema.parse(await ctx.request.json().catch(() => ({})));
      const scope = await tenantScopeIds(ctx.principal);

      const [allocation] = await db
        .select()
        .from(s.familyCapitalAllocations)
        .where(and(inArray(s.familyCapitalAllocations.tenantId, scope), eq(s.familyCapitalAllocations.id, body.allocationId)))
        .limit(1);
      if (!allocation) {
        return apiError("ALLOCATION_NOT_FOUND", `No capital allocation '${body.allocationId}' exists in scope. A committee decision needs something to decide about.`, 404, ctx.traceId);
      }
      if (allocation.requesterRef === ctx.principal.userId) {
        return apiError("SEGREGATION_OF_DUTIES", "The person who raised this capital request may not record the committee decision on it.", 403, ctx.traceId);
      }

      const id = newId(ID_PREFIX.foCommitteeDecision);
      const findings = validateCommitteeDecision({
        id,
        tenantId: ctx.principal.tenantId,
        allocationId: body.allocationId,
        decision: body.decision,
        bodyRef: body.bodyRef,
        members: body.members.map((m) => ({ ...m, dissentReason: m.dissentReason ?? null })),
        quorumMinimum: body.quorumMinimum,
        majorityRule: body.majorityRule,
        date: body.decisionDate,
        reason: body.reason,
        conditions: body.conditions,
        followUps: body.followUps,
        authorityRef: body.authorityRef ?? null,
        decidedByActorType: "HUMAN",
        requesterRef: body.requesterRef,
        executorRef: body.executorRef ?? null,
        reconcilerRef: body.reconcilerRef ?? null,
      });
      if (findings.length > 0) {
        return apiError("COMMITTEE_DECISION_INVALID", "The decision does not satisfy the committee's quorum and majority rules and was not recorded.", 422, ctx.traceId, { findings });
      }

      return await withIdempotency(ctx, "family.committee.decide", body, async () => {
        await withAuditTransaction(
          async () => {
            await db.insert(s.familyCommitteeDecisions).values({
              id,
              tenantId: ctx.principal.tenantId,
              allocationId: body.allocationId,
              decision: body.decision,
              bodyRef: body.bodyRef,
              members: body.members.map((m) => ({ ...m, dissentReason: m.dissentReason ?? null })),
              quorumMinimum: body.quorumMinimum,
              majorityRule: body.majorityRule,
              decisionDate: body.decisionDate,
              reason: body.reason,
              conditions: body.conditions,
              followUps: body.followUps,
              authorityRef: body.authorityRef ?? null,
              decidedByActorType: "HUMAN",
              requesterRef: body.requesterRef,
              executorRef: body.executorRef ?? null,
              reconcilerRef: body.reconcilerRef ?? null,
              classification: "HIGHLY_RESTRICTED",
            });
            return { id };
          },
          (r) => ({
            tenantId: ctx.principal.tenantId,
            actorUserId: ctx.principal.userId,
            actorType: "HUMAN" as const,
            action: "family.committee.decide",
            objectType: "FAMILY_COMMITTEE_DECISION",
            objectId: r.id,
            outcome: "SUCCESS" as const,
            authority: "familyoffice:committee.decide",
            newValue: { decision: body.decision, bodyRef: body.bodyRef, members: body.members.length, authorityRef: body.authorityRef },
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
            traceId: ctx.traceId,
          }),
        );
        return { status: 201, body: { id, allocationId: body.allocationId, decision: body.decision } };
      });
    },
  );
}
