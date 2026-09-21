import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceLegalHolds } from "@/db/schema";
import type { Principal } from "../authz";
import { ID_PREFIX, newId } from "../ids";
import { withAuditTransaction } from "../audit";
import {
  ApplyLegalHoldSchema,
  ReleaseLegalHoldSchema,
  type ApplyLegalHoldInput,
  type ReleaseLegalHoldInput,
} from "./legal-hold-contract";

function fail(msg: string): never {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "GOVERNANCE_LEGAL_HOLD_DENIED";
  throw err;
}

export async function applyLegalHold(
  principal: Principal,
  rawInput: ApplyLegalHoldInput,
) {
  const input = ApplyLegalHoldSchema.parse(rawInput);
  const holdId = newId(ID_PREFIX.governanceLegalHold);
  const now = new Date();

  const record = {
    id: holdId,
    tenantId: principal.tenantId,
    bodyId: input.bodyId ?? null,
    holdTitle: input.holdTitle,
    holdReason: input.holdReason,
    matterReference: input.matterReference,
    status: "ACTIVE",
    appliedByUserId: principal.userId,
    appliedAt: now,
    releasedByUserId: null,
    releasedAt: null,
    releaseJustification: null,
  };

  return withAuditTransaction(
    async (tx) => {
      await tx.insert(governanceLegalHolds).values(record);
      return record;
    },
    (r) => ({
      action: "GOVERNANCE_LEGAL_HOLD_APPLIED",
      objectType: "GOVERNANCE_LEGAL_HOLD",
      objectId: holdId,
      actorUserId: principal.userId,
      tenantId: principal.tenantId,
      details: { holdTitle: input.holdTitle, matterReference: input.matterReference, bodyId: input.bodyId },
    }),
  );
}

export async function isBodyUnderLegalHold(bodyId: string): Promise<boolean> {
  const holds = await db
    .select()
    .from(governanceLegalHolds)
    .where(and(eq(governanceLegalHolds.bodyId, bodyId), eq(governanceLegalHolds.status, "ACTIVE")));
  return holds.length > 0;
}

export async function releaseLegalHold(
  principal: Principal,
  rawInput: ReleaseLegalHoldInput,
) {
  const input = ReleaseLegalHoldSchema.parse(rawInput);
  const [hold] = await db
    .select()
    .from(governanceLegalHolds)
    .where(eq(governanceLegalHolds.id, input.holdId));
  if (!hold) throw fail("Legal hold record not found.");
  if (hold.status !== "ACTIVE") throw fail("Legal hold is not currently ACTIVE.");

  const [updated] = await db
    .update(governanceLegalHolds)
    .set({
      status: "RELEASED",
      releasedByUserId: principal.userId,
      releasedAt: new Date(),
      releaseJustification: input.releaseJustification,
    })
    .where(eq(governanceLegalHolds.id, input.holdId))
    .returning();

  return updated;
}
