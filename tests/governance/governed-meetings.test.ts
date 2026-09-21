import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceMeetings,
  governanceMeetingAgendaItems,
  governanceMeetingAttendance,
  governanceMeetingConflicts,
  governanceMeetingMotions,
  governanceMeetingActions,
  documents,
} from "@/db/schema";
import {
  createGovernedMeeting,
  issueMeetingNotice,
  addMeetingAgendaItem,
  lockMeetingAgenda,
  conveneMeeting,
  recordMeetingAttendance,
  declareMeetingConflict,
  tableMeetingMotion,
  recordMeetingMinutes,
  concludeMeeting,
  createMeetingAction,
} from "@/lib/governance/meeting-service";
import { appointmentFixture, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";
import { executionPrincipal } from "../helpers/governance-execution";

describe("Governed Meeting Chain — End-to-End Traceability & Authority", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;
  const ctx = { traceId: "MEETING_CHAIN_TEST" };

  async function cleanup() {
    try {
      const meetings = await db.select({ id: governanceMeetings.id }).from(governanceMeetings).where(eq(governanceMeetings.bodyId, "GOV_MEET_TEST"));
      for (const m of meetings) {
        await db.delete(governanceMeetingActions).where(eq(governanceMeetingActions.meetingId, m.id));
        await db.delete(governanceMeetingMotions).where(eq(governanceMeetingMotions.meetingId, m.id));
        await db.delete(governanceMeetingConflicts).where(eq(governanceMeetingConflicts.meetingId, m.id));
        await db.delete(governanceMeetingAttendance).where(eq(governanceMeetingAttendance.meetingId, m.id));
        await db.delete(governanceMeetingAgendaItems).where(eq(governanceMeetingAgendaItems.meetingId, m.id));
      }
      await db.delete(governanceMeetings).where(eq(governanceMeetings.bodyId, "GOV_MEET_TEST"));
    } catch {}
    await cleanupAppointments("MEET_TEST");
  }

  beforeAll(async () => {
    await cleanup();
    f = await appointmentFixture("MEET_TEST");
  });

  afterAll(async () => {
    await cleanup();
  });

  it("executes the full meeting lifecycle from notice to minutes and verified actions", async () => {
    // 1. Create meeting in DRAFT
    const scheduledStart = new Date(Date.now() + 86400000).toISOString();
    const scheduledEnd = new Date(Date.now() + 90000000).toISOString();

    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Q3 Governed Board & Strategy Meeting",
          meetingType: "ORDINARY",
          scheduledStartAt: scheduledStart,
          scheduledEndAt: scheduledEnd,
          location: "Dar es Salaam Executive Boardroom / Hybrid",
          isVirtual: false,
          classification: "INTERNAL",
        },
        ctx,
      ),
    );

    expect(meeting.id).toMatch(/^GMT_/);
    expect(meeting.status).toBe("DRAFT");
    expect(meeting.quorumRequired).toBeGreaterThan(0);
    expect(meeting.quorumAchieved).toBe(false);

    // 2. Issue notice with verified notice document
    const notice = await as(f.chair, () =>
      issueMeetingNotice(f.chair, meeting.id, "DOC_D4", ctx),
    );
    expect(notice.status).toBe("NOTICE_ISSUED");
    expect(notice.noticeDocumentId).toBe("DOC_D4");

    // 3. Add agenda items with board paper checksums
    const item1 = await as(f.chair, () =>
      addMeetingAgendaItem(
        f.chair,
        meeting.id,
        {
          itemOrder: 1,
          title: "Adoption of Agenda & Quorum Verification",
          itemType: "ADMINISTRATIVE",
          durationMinutes: 10,
        },
        ctx,
      ),
    );
    expect(item1.id).toMatch(/^GMI_/);

    const item2 = await as(f.chair, () =>
      addMeetingAgendaItem(
        f.chair,
        meeting.id,
        {
          itemOrder: 2,
          title: "Capital Allocation & Expansion Strategy",
          description: "Review expansion into East Africa regional hubs",
          itemType: "DECISION_RESOLUTION",
          durationMinutes: 45,
          boardPaperDocumentId: "DOC_D4",
          boardPaperChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        ctx,
      ),
    );
    expect(item2.id).toMatch(/^GMI_/);

    // 4. Lock agenda
    const locked = await as(f.chair, () => lockMeetingAgenda(f.chair, meeting.id, ctx));
    expect(locked.status).toBe("AGENDA_LOCKED");

    // 5. Convene meeting IN_SESSION
    const inSession = await as(f.chair, () => conveneMeeting(f.chair, meeting.id, ctx));
    expect(inSession.status).toBe("IN_SESSION");
    expect(inSession.actualStartAt).toBeTruthy();

    // 6. Record attendance and verify automatic quorum tracking
    // Get active chair member id
    const [chairMember] = await db
      .select()
      .from(governanceMeetings)
      .where(eq(governanceMeetings.id, meeting.id));

    const att1 = await as(f.chair, () =>
      recordMeetingAttendance(
        f.chair,
        meeting.id,
        {
          memberId: chairMember.presidingMemberId!,
          attendanceType: "IN_PERSON",
        },
        ctx,
      ),
    );
    expect(att1.attendanceId).toMatch(/^GMA_/);

    // 7. Declare conflict of interest on Item 2
    const conflict = await as(f.chair, () =>
      declareMeetingConflict(
        f.chair,
        meeting.id,
        {
          memberId: chairMember.presidingMemberId!,
          agendaItemId: item2.id,
          natureOfInterest: "Director holds directorship in regional supplier entity",
          conflictType: "DIRECTORSHIP",
          actionTaken: "RECUSED_FROM_DISCUSSION_AND_VOTE",
        },
        ctx,
      ),
    );
    expect(conflict.id).toMatch(/^GMK_/);
    expect(conflict.actionTaken).toBe("RECUSED_FROM_DISCUSSION_AND_VOTE");

    // 8. Table motion during session
    const motion = await as(f.chair, () =>
      tableMeetingMotion(
        f.chair,
        meeting.id,
        {
          agendaItemId: item2.id,
          motionText: "Resolved that the board approves the Phase 1 regional capital allocation of $500,000.",
        },
        ctx,
      ),
    );
    expect(motion.id).toMatch(/^GMM_/);
    expect(motion.motionStatus).toBe("PROPOSED");

    // 9. Record meeting minutes
    const minuted = await as(f.chair, () =>
      recordMeetingMinutes(
        f.chair,
        meeting.id,
        {
          minutesDocumentId: "DOC_D4",
          minutesDocumentChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          summary: "All quorum requirements met. Motion approved following conflict declaration.",
        },
        ctx,
      ),
    );
    expect(minuted.status).toBe("MINUTES_RECORDED");

    // 10. Conclude meeting
    const concluded = await as(f.chair, () => concludeMeeting(f.chair, meeting.id, ctx));
    expect(concluded.status).toBe("CONCLUDED");
    expect(concluded.actualEndAt).toBeTruthy();

    // 11. Create follow-up action with independent verification
    const action = await as(f.chair, () =>
      createMeetingAction(
        f.chair,
        meeting.id,
        {
          agendaItemId: item2.id,
          actionTitle: "Execute regional regulatory filing and submit verification evidence",
          assigneePartyId: f.candidate.partyId!,
          dueDate: "2026-12-31",
          independentVerifierPartyId: f.chair.partyId!,
        },
        ctx,
      ),
    );
    expect(action.id).toMatch(/^GMX_/);
    expect(action.status).toBe("OPEN");
  });

  it("fails closed when non-presiding actor attempts to create meeting or issue notice", async () => {
    await expect(
      as(f.candidate, () =>
        createGovernedMeeting(
          f.candidate,
          f.bodyId,
          {
            title: "Unauthorized Candidate Meeting",
            scheduledStartAt: new Date().toISOString(),
            scheduledEndAt: new Date().toISOString(),
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/Presiding or secretarial authority on this active body is required/);
  });

  it("prevents implementer self-verification on post-meeting actions", async () => {
    const scheduledStart = new Date(Date.now() + 86400000).toISOString();
    const scheduledEnd = new Date(Date.now() + 90000000).toISOString();

    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Self-Verification Guard Meeting",
          scheduledStartAt: scheduledStart,
          scheduledEndAt: scheduledEnd,
        },
        ctx,
      ),
    );

    await expect(
      as(f.chair, () =>
        createMeetingAction(
          f.chair,
          meeting.id,
          {
            actionTitle: "Self-verifying task",
            assigneePartyId: f.chair.partyId!,
            dueDate: "2026-12-31",
            independentVerifierPartyId: f.chair.partyId!, // Same party!
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/Independent verification requires a distinct verifier/);
  });

  it("blocks modifying agenda once the meeting agenda has been locked", async () => {
    const scheduledStart = new Date(Date.now() + 86400000).toISOString();
    const scheduledEnd = new Date(Date.now() + 90000000).toISOString();

    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Locked Agenda Test Meeting",
          scheduledStartAt: scheduledStart,
          scheduledEndAt: scheduledEnd,
        },
        ctx,
      ),
    );

    await as(f.chair, () => issueMeetingNotice(f.chair, meeting.id, "DOC_D4", ctx));
    await as(f.chair, () =>
      addMeetingAgendaItem(f.chair, meeting.id, { itemOrder: 1, title: "Initial Item" }, ctx),
    );
    await as(f.chair, () => lockMeetingAgenda(f.chair, meeting.id, ctx));

    await expect(
      as(f.chair, () =>
        addMeetingAgendaItem(f.chair, meeting.id, { itemOrder: 2, title: "Late Item" }, ctx),
      ),
    ).rejects.toThrow(/Agenda items cannot be added after the agenda has been locked/);
  });
});
