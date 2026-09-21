import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceBodies,
  governanceMembers,
  governanceCalendarEvents,
  governanceEscalations,
  users,
} from "@/db/schema";
import type { Principal } from "../authz";
import { ID_PREFIX, newId } from "../ids";
import { withAuditTransaction } from "../audit";
import { readGoverningBody } from "./body-authority";
import {
  CreateCalendarEventSchema,
  AcknowledgeEscalationSchema,
  ResolveEscalationSchema,
  type CreateCalendarEventInput,
  type AcknowledgeEscalationInput,
  type ResolveEscalationInput,
} from "./calendar-contract";
import { classificationRank } from "../constants";

function fail(msg: string): never {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "GOVERNANCE_CALENDAR_DENIED";
  throw err;
}

interface Context {
  traceId?: string;
  correlationId?: string;
}

export async function createCalendarEvent(
  principal: Principal,
  bodyId: string,
  rawInput: CreateCalendarEventInput,
  ctx: Context = {},
) {
  const input = CreateCalendarEventSchema.parse(rawInput);
  const body = await readGoverningBody(principal, bodyId);
  if (body.status !== "ACTIVE") {
    throw fail("Calendar events can only be scheduled for ACTIVE governing bodies.");
  }

  // Compute notice deadline: scheduledDate - noticeRequiredDays
  const schedTime = new Date(input.scheduledDate).getTime();
  const noticeDeadlineDate = new Date(schedTime - input.noticeRequiredDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const eventId = newId(ID_PREFIX.governanceCalendarEvent);
  const now = new Date();

  const record = {
    id: eventId,
    tenantId: body.tenantId,
    bodyId: body.id,
    eventType: input.eventType,
    title: input.title,
    description: input.description ?? null,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime ?? null,
    noticeRequiredDays: input.noticeRequiredDays,
    noticeDispatched: false,
    noticeDeadlineDate,
    status: "UPCOMING",
    linkedMeetingId: input.linkedMeetingId ?? null,
    linkedResolutionId: input.linkedResolutionId ?? null,
    classification: input.classification,
    createdByUserId: principal.userId,
    createdAt: now,
    updatedAt: now,
  };

  return withAuditTransaction(
    async (tx) => {
      await tx.insert(governanceCalendarEvents).values(record);
      return record;
    },
    (r) => ({
      action: "GOVERNANCE_CALENDAR_EVENT_CREATED",
      objectType: "GOVERNANCE_CALENDAR_EVENT",
      objectId: eventId,
      actorUserId: principal.userId,
      tenantId: body.tenantId,
      details: { title: input.title, eventType: input.eventType, scheduledDate: input.scheduledDate },
    }),
  );
}

export async function listUpcomingCalendarEvents(
  principal: Principal,
  bodyId: string,
  startDate = new Date().toISOString().slice(0, 10),
) {
  const body = await readGoverningBody(principal, bodyId);
  const rows = await db
    .select()
    .from(governanceCalendarEvents)
    .where(and(eq(governanceCalendarEvents.bodyId, body.id), gte(governanceCalendarEvents.scheduledDate, startDate)))
    .orderBy(asc(governanceCalendarEvents.scheduledDate));

  return rows.filter((r) => classificationRank(r.classification) <= classificationRank(principal.clearance));
}

export async function evaluateCalendarEscalations(
  principal: Principal,
  bodyId: string,
  asOf = new Date().toISOString().slice(0, 10),
) {
  const body = await readGoverningBody(principal, bodyId);
  const events = await db
    .select()
    .from(governanceCalendarEvents)
    .where(eq(governanceCalendarEvents.bodyId, body.id));

  // Get active presiders for escalation routing
  const presiders = await db
    .select({ partyId: governanceMembers.partyId })
    .from(governanceMembers)
    .where(
      and(
        eq(governanceMembers.bodyId, body.id),
        eq(governanceMembers.lifecycleStatus, "ACTIVE"),
        inArray(governanceMembers.seatRole, ["CHAIR", "SECRETARY"]),
      ),
    );
  const targetPartyIds = presiders.map((p) => p.partyId);

  const escalations = [];

  for (const event of events) {
    if (event.status === "UPCOMING" && !event.noticeDispatched && event.noticeDeadlineDate < asOf) {
      // Notice is overdue — escalate
      const escalationId = newId(ID_PREFIX.governanceEscalation);
      const escalation = {
        id: escalationId,
        tenantId: body.tenantId,
        bodyId: body.id,
        eventId: event.id,
        escalationLevel: "LEVEL_2_URGENT",
        triggerReason: "NOTICE_OVERDUE",
        targetPartyIds,
        status: "ACTIVE",
        escalatedAt: new Date(),
        acknowledgedByUserId: null,
        acknowledgedAt: null,
        resolvedAt: null,
      };

      await db.insert(governanceEscalations).values(escalation);
      await db
        .update(governanceCalendarEvents)
        .set({ status: "ESCALATED", updatedAt: new Date() })
        .where(eq(governanceCalendarEvents.id, event.id));

      escalations.push(escalation);
    }
  }

  return escalations;
}

export async function acknowledgeEscalation(
  principal: Principal,
  rawInput: AcknowledgeEscalationInput,
) {
  const input = AcknowledgeEscalationSchema.parse(rawInput);
  const [esc] = await db
    .select()
    .from(governanceEscalations)
    .where(eq(governanceEscalations.id, input.escalationId));
  if (!esc) throw fail("Governance escalation not found.");

  const [updated] = await db
    .update(governanceEscalations)
    .set({
      status: "ACKNOWLEDGED",
      acknowledgedByUserId: principal.userId,
      acknowledgedAt: new Date(),
    })
    .where(eq(governanceEscalations.id, input.escalationId))
    .returning();

  return updated;
}

export async function resolveEscalation(
  principal: Principal,
  rawInput: ResolveEscalationInput,
) {
  const input = ResolveEscalationSchema.parse(rawInput);
  const [esc] = await db
    .select()
    .from(governanceEscalations)
    .where(eq(governanceEscalations.id, input.escalationId));
  if (!esc) throw fail("Governance escalation not found.");

  const [updated] = await db
    .update(governanceEscalations)
    .set({
      status: "RESOLVED",
      resolvedAt: new Date(),
    })
    .where(eq(governanceEscalations.id, input.escalationId))
    .returning();

  return updated;
}
