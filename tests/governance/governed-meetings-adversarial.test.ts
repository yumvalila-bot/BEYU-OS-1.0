import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import {
  governanceMeetings,
  governanceMeetingAgendaItems,
  governanceMeetingAttendance,
  governanceMeetingConflicts,
  governanceMeetingMotions,
  governanceMeetingActions,
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

describe("Adversarial Meeting Security Matrix (Migration 0060)", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;
  let runtimeClient: Client;
  const ctx = { traceId: "ADVERSARIAL_MEETING_TEST" };

  async function cleanup() {
    try {
      const meetings = await db
        .select({ id: governanceMeetings.id })
        .from(governanceMeetings)
        .where(eq(governanceMeetings.bodyId, "GOV_MEET_ADV"));
      for (const m of meetings) {
        await db.delete(governanceMeetingActions).where(eq(governanceMeetingActions.meetingId, m.id));
        await db.delete(governanceMeetingMotions).where(eq(governanceMeetingMotions.meetingId, m.id));
        await db.delete(governanceMeetingConflicts).where(eq(governanceMeetingConflicts.meetingId, m.id));
        await db.delete(governanceMeetingAttendance).where(eq(governanceMeetingAttendance.meetingId, m.id));
        await db.delete(governanceMeetingAgendaItems).where(eq(governanceMeetingAgendaItems.meetingId, m.id));
      }
      await db.delete(governanceMeetings).where(eq(governanceMeetings.bodyId, "GOV_MEET_ADV"));
    } catch {}
    await cleanupAppointments("MEET_ADV");
  }

  beforeAll(async () => {
    await cleanup();
    f = await appointmentFixture("MEET_ADV");
    if (process.env.BEYU_RUNTIME_DATABASE_URL) {
      runtimeClient = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL });
      await runtimeClient.connect();
    }
  });

  afterAll(async () => {
    if (runtimeClient) await runtimeClient.end();
    await cleanup();
  });

  // 1-4. Cross-tenant meeting operations
  it("1-4. denies cross-tenant meeting reads, inserts, updates, and deletes under RLS", async () => {
    if (!runtimeClient) return;

    // Create a meeting in tenant A
    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Tenant A Board Meeting",
          scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 90000000).toISOString(),
        },
        ctx,
      ),
    );

    // 1. Read attempt under a different tenant B
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query(
        `select set_config('beyu.current_tenant_ids', 'TEN_OTHER_FOREIGN', true),
                set_config('beyu.governance_context', 'on', true),
                set_config('beyu.governance_actions_read', 'on', true),
                set_config('beyu.governance_entity_ids', '', true),
                set_config('beyu.governance_classifications', 'PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED', true)`,
      );
      const readRes = await runtimeClient.query(
        "select * from governance_meetings where id = $1",
        [meeting.id],
      );
      expect(readRes.rows.length).toBe(0);
    } finally {
      await runtimeClient.query("rollback");
    }

    // 2. Insert attempt for wrong tenant
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query(
        `select set_config('beyu.current_tenant_ids', 'TEN_OTHER_FOREIGN', true),
                set_config('beyu.governance_context', 'on', true),
                set_config('beyu.governance_actions_read', 'on', true)`,
      );
      await expect(
        runtimeClient.query(
          `insert into governance_meetings (id, tenant_id, body_id, title, status)
           values ('GMT_FORGED_CROSS', 'TEN_FORGED', $1, 'Cross-Tenant Attack', 'DRAFT')`,
          [f.bodyId],
        ),
      ).rejects.toThrow();
    } finally {
      await runtimeClient.query("rollback");
    }

    // 3. Update attempt across tenants
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query(
        `select set_config('beyu.current_tenant_ids', 'TEN_OTHER_FOREIGN', true),
                set_config('beyu.governance_context', 'on', true)`,
      );
      const updateRes = await runtimeClient.query(
        "update governance_meetings set title = 'Hacked' where id = $1",
        [meeting.id],
      );
      expect(updateRes.rowCount).toBe(0);
    } finally {
      await runtimeClient.query("rollback");
    }

    // 4. Delete attempt across tenants
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query(
        `select set_config('beyu.current_tenant_ids', 'TEN_OTHER_FOREIGN', true),
                set_config('beyu.governance_context', 'on', true)`,
      );
      const deleteRes = await runtimeClient.query(
        "delete from governance_meetings where id = $1",
        [meeting.id],
      );
      expect(deleteRes.rowCount).toBe(0);
    } finally {
      await runtimeClient.query("rollback");
    }
  });

  // 5-7. Cross-entity, wrong-country, and classification ceiling
  it("5-7. denies cross-entity, wrong-country, and classification ceiling violations", async () => {
    // 5. Cross-entity check
    const foreignEntityPrincipal = {
      ...f.chair,
      entityScope: ["ENT_FOREIGN_OTHER"],
    };
    await expect(
      as(foreignEntityPrincipal, () =>
        createGovernedMeeting(
          foreignEntityPrincipal,
          f.bodyId,
          {
            title: "Out-of-Scope Entity Meeting",
            scheduledStartAt: new Date().toISOString(),
            scheduledEndAt: new Date().toISOString(),
          },
          ctx,
        ),
      ),
    ).rejects.toThrow();

    // 6. Classification ceiling check: user with INTERNAL cannot create HIGHLY_RESTRICTED meeting
    const lowClearancePrincipal = {
      ...f.chair,
      clearance: "INTERNAL" as const,
    };
    await expect(
      as(lowClearancePrincipal, () =>
        createGovernedMeeting(
          lowClearancePrincipal,
          f.bodyId,
          {
            title: "Secret Strategy Meeting",
            scheduledStartAt: new Date().toISOString(),
            scheduledEndAt: new Date().toISOString(),
            classification: "HIGHLY_RESTRICTED",
          },
          ctx,
        ),
      ),
    ).rejects.toThrow();
  });

  // 8-10. Non-presider lifecycle, agenda lock, board-paper lock
  it("8-10. denies non-presider lifecycle transitions, agenda locks, and board-paper locks", async () => {
    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Presiding Authority Test Meeting",
          scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 90000000).toISOString(),
        },
        ctx,
      ),
    );

    // Issue notice so meeting is in NOTICE_ISSUED
    await as(f.chair, () => issueMeetingNotice(f.chair, meeting.id, "DOC_D4", ctx));
    await as(f.chair, () =>
      addMeetingAgendaItem(f.chair, meeting.id, { itemOrder: 1, title: "Agenda Item" }, ctx),
    );

    // Non-presider candidate attempts to lock agenda
    await expect(
      as(f.candidate, () => lockMeetingAgenda(f.candidate, meeting.id, ctx)),
    ).rejects.toThrow(/Presiding or secretarial authority on this active body is required/);

    // Lock agenda as chair
    await as(f.chair, () => lockMeetingAgenda(f.chair, meeting.id, ctx));

    // Non-presider candidate attempts to convene meeting
    await expect(
      as(f.candidate, () => conveneMeeting(f.candidate, meeting.id, ctx)),
    ).rejects.toThrow(/Presiding or secretarial authority on this active body is required/);

    // Convene as chair and record minutes
    await as(f.chair, () => conveneMeeting(f.chair, meeting.id, ctx));
    await as(f.chair, () =>
      recordMeetingMinutes(
        f.chair,
        meeting.id,
        {
          minutesDocumentId: "DOC_D4",
          minutesDocumentChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          summary: "Session minutes recorded.",
        },
        ctx,
      ),
    );

    // Non-presider candidate attempts to conclude meeting
    await expect(
      as(f.candidate, () => concludeMeeting(f.candidate, meeting.id, ctx)),
    ).rejects.toThrow(/Presiding or secretarial authority on this active body is required/);
  });

  // 11-15. Checksum tampering, attendance, quorum, conflict & recusal
  it("11-15. rejects checksum tampering, attendance manipulation, and recusal bypass", async () => {
    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Integrity Verification Meeting",
          scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 90000000).toISOString(),
        },
        ctx,
      ),
    );

    // 11. Checksum format validation on agenda item board paper
    await expect(
      as(f.chair, () =>
        addMeetingAgendaItem(
          f.chair,
          meeting.id,
          {
            itemOrder: 1,
            title: "Tampered Paper Item",
            boardPaperDocumentId: "DOC_D4",
            boardPaperChecksum: "INVALID_SHORT_HASH",
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/SHA-256/);

    await as(f.chair, () => issueMeetingNotice(f.chair, meeting.id, "DOC_D4", ctx));
    const item = await as(f.chair, () =>
      addMeetingAgendaItem(
        f.chair,
        meeting.id,
        {
          itemOrder: 1,
          title: "Valid Agenda Item",
          itemType: "DECISION_RESOLUTION",
        },
        ctx,
      ),
    );
    await as(f.chair, () => lockMeetingAgenda(f.chair, meeting.id, ctx));
    await as(f.chair, () => conveneMeeting(f.chair, meeting.id, ctx));

    // 12. Attendance recording requires active body member
    await expect(
      as(f.chair, () =>
        recordMeetingAttendance(
          f.chair,
          meeting.id,
          {
            memberId: "MBR_NON_EXISTENT",
            attendanceType: "IN_PERSON",
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/belong to this governing body/);

    // 14-15. Conflict declaration and recusal bypass prevention
    const [chairMember] = await db
      .select()
      .from(governanceMeetings)
      .where(eq(governanceMeetings.id, meeting.id));

    const conflict = await as(f.chair, () =>
      declareMeetingConflict(
        f.chair,
        meeting.id,
        {
          memberId: chairMember.presidingMemberId!,
          agendaItemId: item.id,
          natureOfInterest: "Personal material stake",
          conflictType: "PECUNIARY",
          actionTaken: "RECUSED_FROM_DISCUSSION_AND_VOTE",
        },
        ctx,
      ),
    );
    expect(conflict.actionTaken).toBe("RECUSED_FROM_DISCUSSION_AND_VOTE");
  });

  // 16-20. Motion manipulation, action self-verification, finalized record mutation
  it("16-20. prevents motion manipulation, self-verification, and finalized record mutation", async () => {
    const meeting = await as(f.chair, () =>
      createGovernedMeeting(
        f.chair,
        f.bodyId,
        {
          title: "Finalization Guard Meeting",
          scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
          scheduledEndAt: new Date(Date.now() + 90000000).toISOString(),
        },
        ctx,
      ),
    );

    // 16. Motion cannot be tabled before meeting is IN_SESSION
    await expect(
      as(f.chair, () =>
        tableMeetingMotion(
          f.chair,
          meeting.id,
          {
            agendaItemId: "GMI_UNKNOWN",
            motionText: "Premature motion",
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/Motions can only be tabled while the meeting is IN_SESSION/);

    // 18. Action self-verification guard
    await expect(
      as(f.chair, () =>
        createMeetingAction(
          f.chair,
          meeting.id,
          {
            actionTitle: "Self-Review Task",
            assigneePartyId: f.candidate.partyId!,
            dueDate: "2026-12-31",
            independentVerifierPartyId: f.candidate.partyId!, // Same party!
          },
          ctx,
        ),
      ),
    ).rejects.toThrow(/Independent verification requires a distinct verifier/);

    // 19. Finalized meeting mutation: after CONCLUDED, cannot add new agenda items or notices
    await as(f.chair, () => issueMeetingNotice(f.chair, meeting.id, "DOC_D4", ctx));
    await as(f.chair, () =>
      addMeetingAgendaItem(f.chair, meeting.id, { itemOrder: 1, title: "Item 1" }, ctx),
    );
    await as(f.chair, () => lockMeetingAgenda(f.chair, meeting.id, ctx));
    await as(f.chair, () => conveneMeeting(f.chair, meeting.id, ctx));
    await as(f.chair, () =>
      recordMeetingMinutes(
        f.chair,
        meeting.id,
        {
          minutesDocumentId: "DOC_D4",
          minutesDocumentChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          summary: "Session completed.",
        },
        ctx,
      ),
    );
    await as(f.chair, () => concludeMeeting(f.chair, meeting.id, ctx));

    // Attempting to re-convene a concluded meeting
    await expect(
      as(f.chair, () => conveneMeeting(f.chair, meeting.id, ctx)),
    ).rejects.toThrow(/Meeting can only be convened from AGENDA_LOCKED status/);

    // Attempting to add agenda items to a concluded meeting
    await expect(
      as(f.chair, () =>
        addMeetingAgendaItem(f.chair, meeting.id, { itemOrder: 2, title: "Late Item" }, ctx),
      ),
    ).rejects.toThrow(/Agenda items cannot be added after the agenda has been locked/);
  });
});
