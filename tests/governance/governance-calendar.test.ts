import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceCalendarEvents,
  governanceEscalations,
} from "@/db/schema";
import {
  createCalendarEvent,
  listUpcomingCalendarEvents,
  evaluateCalendarEscalations,
  acknowledgeEscalation,
  resolveEscalation,
} from "@/lib/governance/calendar-service";
import { appointmentFixture, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";

describe("Governed Calendar & Escalations Lifecycle", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;
  const ctx = { traceId: "CALENDAR_TEST" };

  beforeAll(async () => {
    f = await appointmentFixture("CAL_TEST");
  });

  afterAll(async () => {
    await db.delete(governanceEscalations).where(eq(governanceEscalations.bodyId, f.bodyId));
    await db.delete(governanceCalendarEvents).where(eq(governanceCalendarEvents.bodyId, f.bodyId));
    await cleanupAppointments("CAL_TEST");
  });

  it("schedules calendar events and calculates required notice deadlines", async () => {
    const scheduledDate = "2026-11-15";
    const event = await as(f.chair, () =>
      createCalendarEvent(
        f.chair,
        f.bodyId,
        {
          eventType: "BOARD_MEETING",
          title: "Q4 Annual Strategic & Governance Review",
          description: "Review annual group performance and upcoming board charter updates",
          scheduledDate,
          scheduledTime: "09:00",
          noticeRequiredDays: 21,
          classification: "INTERNAL",
        },
        ctx,
      ),
    );

    expect(event.id).toMatch(/^GCE_/);
    expect(event.noticeDeadlineDate).toBe("2026-10-25"); // 2026-11-15 minus 21 days
    expect(event.status).toBe("UPCOMING");
    expect(event.noticeDispatched).toBe(false);

    const upcoming = await as(f.chair, () => listUpcomingCalendarEvents(f.chair, f.bodyId, "2026-01-01"));
    expect(upcoming.some((u) => u.id === event.id)).toBe(true);
  });

  it("evaluates and triggers automated escalations when notice deadline is missed", async () => {
    // Create an event with a past notice deadline
    const event = await as(f.chair, () =>
      createCalendarEvent(
        f.chair,
        f.bodyId,
        {
          eventType: "STATUTORY_FILING_DEADLINE",
          title: "Annual BRELA Statutory Filing Deadline",
          scheduledDate: "2026-09-25",
          noticeRequiredDays: 14, // Notice deadline was 2026-09-11
        },
        ctx,
      ),
    );

    // Evaluate escalations as of 2026-09-21 (past the notice deadline)
    const escalations = await as(f.chair, () =>
      evaluateCalendarEscalations(f.chair, f.bodyId, "2026-09-21"),
    );

    expect(escalations.length).toBeGreaterThan(0);
    const triggered = escalations.find((e) => e.eventId === event.id);
    expect(triggered).toBeTruthy();
    expect(triggered!.triggerReason).toBe("NOTICE_OVERDUE");
    expect(triggered!.escalationLevel).toBe("LEVEL_2_URGENT");
    expect(triggered!.status).toBe("ACTIVE");

    // Acknowledge escalation
    const ack = await as(f.secretary, () =>
      acknowledgeEscalation(f.secretary, {
        escalationId: triggered!.id,
        note: "Secretary noted urgency; dispatching emergency statutory notices",
      }),
    );
    expect(ack.status).toBe("ACKNOWLEDGED");
    expect(ack.acknowledgedByUserId).toBe(f.secretary.userId);

    // Resolve escalation
    const res = await as(f.chair, () =>
      resolveEscalation(f.chair, {
        escalationId: triggered!.id,
        resolutionNote: "Notices dispatched and filing submitted to registrar",
      }),
    );
    expect(res.status).toBe("RESOLVED");
    expect(res.resolvedAt).toBeTruthy();
  });
});
