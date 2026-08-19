import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
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
 *              duplicates collide on the primary key and are rejected, so a
 *              retried mutation cannot execute twice.
 */

/** How long a completed idempotent response remains replayable. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** A stale IN_FLIGHT claim (crashed request) may be reclaimed after this. */
const IN_FLIGHT_RECLAIM_MS = 60_000;

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

  // Opportunistic cleanup of expired rows keeps the ledger bounded without a job.
  await db.delete(idempotencyRecords).where(lt(idempotencyRecords.expiresAt, now));

  // Claim atomically. ON CONFLICT DO NOTHING means exactly one concurrent caller
  // inserts the row; everyone else falls through to inspect the existing record.
  const inserted = await db
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

  const [existing] = await db
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

  // A crashed request can leave a stale claim; allow reclaim after a grace period.
  if (now.getTime() - existing.createdAt.getTime() > IN_FLIGHT_RECLAIM_MS) {
    const reclaimed = await db
      .update(idempotencyRecords)
      .set({ createdAt: now, requestHash })
      .where(
        and(
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.idempotencyKey, key),
          eq(idempotencyRecords.state, "IN_FLIGHT"),
          lt(idempotencyRecords.createdAt, new Date(now.getTime() - IN_FLIGHT_RECLAIM_MS)),
        ),
      )
      .returning({ scope: idempotencyRecords.scope });
    if (reclaimed.length > 0) return { kind: "PROCEED", scope, key, requestHash };
  }

  return { kind: "IN_FLIGHT" };
}

/** Record the response so an identical retry replays instead of re-executing. */
export async function completeIdempotencyKey(
  claim: Extract<IdempotencyOutcome, { kind: "PROCEED" }>,
  statusCode: number,
  body: unknown,
  traceId?: string,
): Promise<void> {
  await db
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
      ),
    );
}

/**
 * Release a claim when the mutation failed, so the caller may retry.
 * Only IN_FLIGHT claims are released; a COMPLETED response is never withdrawn.
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
