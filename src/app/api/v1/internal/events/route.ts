/**
 * POST /api/v1/internal/events
 *
 * Governed cross-OS event ingestion (service-to-service).
 *
 * Sector OSs (Health first) deliver domain events here through the Phase 8
 * governed event transport: the sector writes a transactional outbox row in
 * the SAME transaction as the business mutation, and its dispatcher
 * delivers the row to this endpoint with an authenticated service token.
 *
 * EXACTLY-ONCE ACCEPTANCE (structural):
 *   The idempotency receipt is claimed atomically
 *   (`INSERT … ON CONFLICT (idempotency_key) DO NOTHING`) in the SAME
 *   transaction that appends the governed enterprise event and the audit
 *   record. A duplicate delivery can therefore never produce a second
 *   enterprise event — it increments duplicateCount and returns the
 *   ORIGINAL event id with `duplicate: true`. At-least-once transport +
 *   exactly-once business effect.
 *
 * The event is appended to the immutable hash-chained `enterprise_events`
 * ledger (hash version 2 — the complete interoperability envelope is
 * tamper-evident). The sector's own event id is preserved inside the payload
 * (`sectorEventId`) and in the receipt, so both sides can reconcile.
 *
 * Constitutional boundary: this endpoint RECORDS governed events; it does
 * not grant authority. Financial consequences (journal posting) remain
 * governed Finance OS operations — CAP_POSTING is ratified separately, and
 * no sector can mint itself constitutional authority through an event.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, tenants, legalEntities } from "@/db/schema";
import { publishEventTx } from "@/lib/audit";
import { recordAuditTx, type EventInput } from "@/lib/audit";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { apiError, apiOk, guardedInternal } from "@/lib/internal/api";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 128 * 1024;

const EventSchema = z
  .object({
    /** Sector-side idempotency key — REQUIRED, defines exactly-once identity. */
    idempotencyKey: z.string().min(8).max(200),
    /** Sector-side event id (recorded in payload.sectorEventId + receipt audit). */
    sectorEventId: z.string().min(8).max(120),
    eventType: z.string().min(3).max(120),
    eventVersion: z.string().min(1).max(20).default("1"),
    schemaVersion: z.string().min(1).max(20).default("1"),
    source: z.enum(["HEALTH_OS", "AGRICULTURE_OS", "FINANCE_OS", "FOUNDATION_OS"]),
    domain: z.string().min(2).max(60),
    operation: z.string().min(2).max(80),
    destinationDomain: z.string().min(2).max(60).nullable().optional(),
    /** Canonical tenant CODE (e.g. BEYU-HEALTH) — resolved and validated. */
    tenantCode: z.string().min(2).max(50),
    legalEntityId: z.string().max(60).nullable().optional(),
    subjectType: z.string().min(2).max(60),
    subjectId: z.string().min(1).max(120),
    /** Canonical GlobalUserID of the acting human, if any. Must exist. */
    actorGlobalUserId: z.string().max(60).nullable().optional(),
    classification: z
      .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"])
      .default("INTERNAL"),
    correlationId: z.string().min(4).max(120),
    causationId: z.string().max(120).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export async function POST(request: Request) {
  return guardedInternal(
    request,
    {
      action: "events.publish",
      schema: EventSchema,
      rateLimit: { limit: 600, windowMs: 60_000 },
    },
    async ({ body, token, traceId }) => {
      if (JSON.stringify(body.payload).length > MAX_PAYLOAD_BYTES) {
        return apiError("PAYLOAD_TOO_LARGE", "Event payload exceeds 128 KiB.", 413, traceId);
      }

      // Tenant resolution — same contract as internal identity register.
      const tenant = await db
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.code, body.tenantCode))
        .limit(1);
      if (tenant.length === 0) {
        return apiError("TENANT_NOT_FOUND", `Tenant ${body.tenantCode} does not exist.`, 404, traceId);
      }
      if (tenant[0].status !== "ACTIVE") {
        return apiError("TENANT_NOT_ACTIVE", `Tenant ${body.tenantCode} is not ACTIVE.`, 409, traceId);
      }
      const tenantId = tenant[0].id;

      // A claimed human actor MUST be a canonical identity — no shadow actors,
      // and no attribution through a revoked or suspended identity (revocation
      // must fail closed everywhere, including event attribution).
      if (body.actorGlobalUserId) {
        const actor = await db
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(eq(users.id, body.actorGlobalUserId))
          .limit(1);
        if (actor.length === 0 || actor[0].status !== "ACTIVE") {
          return apiError(
            "ACTOR_NOT_FOUND",
            "actorGlobalUserId does not reference an ACTIVE canonical identity.",
            422,
            traceId,
          );
        }
      }

      // A claimed legal entity MUST exist and belong to the resolved tenant —
      // a sender may never attribute an event to another tenant's entity.
      if (body.legalEntityId) {
        const entity = await db
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(and(eq(legalEntities.id, body.legalEntityId), eq(legalEntities.tenantId, tenantId)))
          .limit(1);
        if (entity.length === 0) {
          return apiError(
            "LEGAL_ENTITY_NOT_FOUND",
            "legalEntityId does not reference a legal entity of the resolved tenant.",
            422,
            traceId,
          );
        }
      }

      return withDatabaseRlsContext([tenantId], false, async () => {
        return db.transaction(async (tx) => {
          // ── 1. Atomic idempotency claim ────────────────────────────────
          const claimed = await tx.execute(
            sql`insert into "internal_event_receipts"
                  ("idempotency_key", "source", "tenant_id", "event_type")
                values (${body.idempotencyKey}, ${body.source}, ${tenantId}, ${body.eventType})
                on conflict ("idempotency_key") do nothing
                returning "idempotency_key"`,
          );

          if (claimed.rows.length === 0) {
            // ── DUPLICATE delivery: exactly-once acceptance ──────────────
            // The duplicate is only honored when the existing receipt belongs
            // to THIS (source, tenant, event type). A key reused across
            // tenants/sources is an idempotency-key COLLISION — fail closed
            // with 409 (permanent for the dispatcher) instead of leaking the
            // original event id to a different tenant.
            const existing = await tx.execute(
              sql`update "internal_event_receipts"
                     set "duplicate_count" = "duplicate_count" + 1
                   where "idempotency_key" = ${body.idempotencyKey}
                     and "source" = ${body.source}
                     and "tenant_id" = ${tenantId}
                     and "event_type" = ${body.eventType}
                   returning "event_id", "duplicate_count", "first_seen_at"`,
            );
            if (existing.rows.length === 0) {
              await recordAuditTx(tx as never, {
                tenantId,
                actorType: "SERVICE",
                action: "internal.events.publish",
                objectType: "EVENT",
                objectId: body.idempotencyKey,
                outcome: "DENIED",
                reason: "IDEMPOTENCY_KEY_COLLISION",
                newValue: {
                  idempotencyKey: body.idempotencyKey,
                  eventType: body.eventType,
                  source: body.source,
                  tenantCode: body.tenantCode,
                },
                traceId,
              });
              return apiError(
                "IDEMPOTENCY_KEY_COLLISION",
                "The idempotency key is already claimed by a different source, tenant or event type.",
                409,
                traceId,
              );
            }
            const receipt = existing.rows[0] as {
              event_id: string | null;
              duplicate_count: number;
              first_seen_at: string;
            };
            await recordAuditTx(tx as never, {
              tenantId,
              actorType: "SERVICE",
              action: "internal.events.publish",
              objectType: "EVENT",
              objectId: receipt.event_id ?? body.idempotencyKey,
              outcome: "SUCCESS",
              reason: "DUPLICATE_DELIVERY",
              newValue: {
                idempotencyKey: body.idempotencyKey,
                eventType: body.eventType,
                source: body.source,
                duplicateCount: receipt.duplicate_count,
              },
              traceId,
            });
            return apiOk(
              {
                accepted: false,
                duplicate: true,
                eventId: receipt.event_id,
                firstSeenAt: receipt.first_seen_at,
                duplicateCount: receipt.duplicate_count,
              },
              traceId,
            );
          }

          // ── 2. First delivery: append the governed enterprise event ────
          const eventInput: EventInput = {
            type: body.eventType,
            eventVersion: body.eventVersion,
            schemaVersion: body.schemaVersion,
            source: body.source,
            domain: body.domain,
            operation: body.operation,
            destinationDomain: body.destinationDomain ?? null,
            tenantId,
            legalEntityId: body.legalEntityId ?? null,
            subjectType: body.subjectType,
            subjectId: body.subjectId,
            actorUserId: body.actorGlobalUserId ?? null,
            actorType: "SERVICE",
            classification: body.classification,
            payload: { ...body.payload, sectorEventId: body.sectorEventId },
            traceId,
            correlationId: body.correlationId,
            causationId: body.causationId ?? null,
            authorityContext: {
              authorityId: token.sub,
              decisionId: null,
              capabilityCode: null,
              permissionCode: null,
              policyVersion: null,
            },
            policyVersion: null,
            // Sector-declared occurrence time is honored (already validated as
            // ISO 8601 by the envelope schema) and covered by the event hash.
            occurredAt: body.occurredAt ?? undefined,
          };
          const eventId = await publishEventTx(tx as never, eventInput);

          // ── 3. Link the receipt to the event (same transaction) ───────
          await tx.execute(
            sql`update "internal_event_receipts"
                   set "event_id" = ${eventId}
                 where "idempotency_key" = ${body.idempotencyKey}`,
          );

          await recordAuditTx(tx as never, {
            tenantId,
            actorType: "SERVICE",
            action: "internal.events.publish",
            objectType: "EVENT",
            objectId: eventId,
            outcome: "SUCCESS",
            newValue: {
              idempotencyKey: body.idempotencyKey,
              sectorEventId: body.sectorEventId,
              eventType: body.eventType,
              domain: body.domain,
              operation: body.operation,
              source: body.source,
            },
            traceId,
          });

          return apiOk(
            {
              accepted: true,
              duplicate: false,
              eventId,
            },
            traceId,
            201,
          );
        });
      });
    },
  );
}
