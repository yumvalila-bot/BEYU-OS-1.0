import { and, eq, lt, sql } from "drizzle-orm";
import { db, withIndependentDatabase } from "@/db";
import { idempotencyRecords } from "@/db/schema";
import { sha256, stableStringify } from "./crypto";
import type { Principal } from "./authz";

/**
 * BEYU OS — governed idempotency.
 *
 * Remediation A-01. The previous implementation was an in-process
 * `Map<key, body>` keyed ONLY on the raw Idempotency-Key header, which meant:
 *   - a different actor reusing a guessable key received the FIRST actor's
 *     response body (cross-actor / cross-tenant disclosure),
 *   - a different payload under the same key silently returned the old result,
 *   - concurrent requests with the same key both committed,
 *   - all state was lost on restart and never shared across replicas.
 *
 * This module replaces it with a durable, scoped ledger:
 *   - SCOPE  = tenant + acting user + endpoint. A key is meaningless outside the
 *              principal that created it, so cross-actor replay is impossible.
 *   - HASH   = canonical hash of the request payload. Same key + same payload
 *              replays; same key + different payload is a 409 CONFLICT.
 *   - CLAIM  = an IN_FLIGHT row inserted before the domain write. Concurrent
 *              duplicates collide on the primary key and are rejected. An
 *              uncertain claim is never auto-reclaimed because the domain may
 *              have committed just before the response was lost.
 */

/** How long a completed idempotent response remains replayable. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * IN_FLIGHT claims are intentionally not auto-reclaimed. A crash can happen
 * after the domain transaction commits but before completion is recorded; retrying
 * then would execute a non-idempotent domain action twice. Recovery requires an
 * operator to reconcile the claim against domain state before release.
 */

export type IdempotencyOutcome =
  | { kind: "PROCEED"; scope: string; key: string; requestHash: string }
  | { kind: "NO_KEY" }
  | { kind: "REPLAY"; statusCode: number; body: unknown }
  | { kind: "MISMATCH" }
  | { kind: "IN_FLIGHT" };

/**
 * Build the isolation scope for an idempotency key.
 * Derived exclusively from the authenticated principal and the endpoint — a
 * client cannot influence it.
 */
export function idempotencyScope(principal: Principal, endpoint: string): string {
  return `${principal.tenantId}:${principal.userId}:${endpoint}`;
}

export function hashRequest(payload: unknown): string {
  return sha256(stableStringify(payload));
}

/**
 * Attempt to claim an idempotency key before performing a mutation.
 *
 * Returns PROCEED when the caller owns the claim and must run the mutation,
 * REPLAY when a completed response can be returned verbatim, MISMATCH when the
 * key was used with a different payload, and IN_FLIGHT when a concurrent request
 * currently holds the claim.
 */
export async function claimIdempotencyKey(
  principal: Principal,
  endpoint: string,
  rawKey: string | null,
  payload: unknown,
): Promise<IdempotencyOutcome> {
  if (!rawKey) return { kind: "NO_KEY" };

  const key = rawKey.trim();
  if (!key) return { kind: "NO_KEY" };

  const scope = idempotencyScope(principal, endpoint);
  const requestHash = hashRequest(payload);
  const now = new Date();

  // The claim must commit independently of the request/domain transaction. If
  // that transaction later rolls back or the process crashes, the durable
  // IN_FLIGHT record remains and forces operator reconciliation rather than
  // permitting an uncertain mutation to execute twice.
  return withIndependentDatabase(async (database) => {
  // Completed responses may be cleaned up after their TTL. IN_FLIGHT rows are
  // retained indefinitely: expiry must never turn an uncertain outcome into a
  // second execution opportunity.
  await database
    .delete(idempotencyRecords)
    .where(and(eq(idempotencyRecords.state, "COMPLETED"), lt(idempotencyRecords.expiresAt, now)));

  // Claim atomically. ON CONFLICT DO NOTHING means exactly one concurrent caller
  // inserts the row; everyone else falls through to inspect the existing record.
  const inserted = await database
    .insert(idempotencyRecords)
    .values({
      scope,
      idempotencyKey: key,
      requestHash,
      state: "IN_FLIGHT",
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
    })
    .onConflictDoNothing()
    .returning({ scope: idempotencyRecords.scope });

  if (inserted.length > 0) return { kind: "PROCEED", scope, key, requestHash };

  const [existing] = await database
    .select()
    .from(idempotencyRecords)
    .where(and(eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.idempotencyKey, key)))
    .limit(1);

  if (!existing) {
    // Raced with the expiry sweep; the key is free again.
    return { kind: "PROCEED", scope, key, requestHash };
  }

  // Same key, different payload — never return the previous result.
  if (existing.requestHash !== requestHash) return { kind: "MISMATCH" };

  if (existing.state === "COMPLETED") {
    return {
      kind: "REPLAY",
      statusCode: existing.statusCode ?? 200,
      body: existing.responseBody,
    };
  }

  // An uncertain/crashed request is fail-closed. The claim must be reconciled
  // against the domain state by an operator before it can be released; automatic
  // reclaim would defeat replay safety for non-idempotent domain operations.
  return { kind: "IN_FLIGHT" };
  });
}

/** Record the response so an identical retry replays instead of re-executing. */
export async function completeIdempotencyKey(
  claim: Extract<IdempotencyOutcome, { kind: "PROCEED" }>,
  statusCode: number,
  body: unknown,
  traceId?: string,
): Promise<void> {
  const completed = await db
    .update(idempotencyRecords)
    .set({
      state: "COMPLETED",
      statusCode,
      responseBody: body as Record<string, unknown>,
      completedAt: new Date(),
      traceId,
    })
    .where(
      and(
        eq(idempotencyRecords.scope, claim.scope),
        eq(idempotencyRecords.idempotencyKey, claim.key),
        eq(idempotencyRecords.requestHash, claim.requestHash),
        eq(idempotencyRecords.state, "IN_FLIGHT"),
      ),
    )
    .returning({ scope: idempotencyRecords.scope });
  if (completed.length !== 1) {
    // The domain operation may already have committed. Do not silently return a
    // response that cannot be replayed, and do not release the uncertain claim.
    throw new Error("Idempotency completion could not be recorded; claim requires reconciliation.");
  }
}

/**
 * Release a claim only when the caller has established that no domain mutation
 * committed (for example a validated/domain error). Only IN_FLIGHT claims are
 * released; a COMPLETED response is never withdrawn. Unknown failures must not
 * call this function.
 */
export async function releaseIdempotencyKey(
  claim: Extract<IdempotencyOutcome, { kind: "PROCEED" }>,
): Promise<void> {
  await db
    .delete(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.scope, claim.scope),
        eq(idempotencyRecords.idempotencyKey, claim.key),
        eq(idempotencyRecords.state, "IN_FLIGHT"),
      ),
    );
}

/** Test/ops helper: how many live claims exist for a principal's scope. */
export async function idempotencyDepth(scope: string): Promise<number> {
  const r = await db.execute<{ n: string }>(
    sql`select count(*)::text as n from idempotency_records where scope = ${scope}`,
  );
  return Number(r.rows[0]?.n ?? 0);
}
