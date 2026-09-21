import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceBodies,
  governanceMembers,
  governanceMeetings,
  governanceMeetingAgendaItems,
  governanceMeetingAttendance,
  governanceMeetingConflicts,
  governanceMeetingMotions,
  governanceMeetingActions,
  documents,
  parties,
  resolutions,
  users,
} from "@/db/schema";
import type { Principal } from "../authz";
import { ID_PREFIX, newId } from "../ids";
import { withAuditTransaction } from "../audit";
import { readGoverningBody, readBodyDocument } from "./body-authority";
import {
  CreateMeetingInputSchema,
  AddAgendaItemInputSchema,
  RecordAttendanceInputSchema,
  DeclareConflictInputSchema,
  TableMotionInputSchema,
  RecordMinutesInputSchema,
  CreateMeetingActionInputSchema,
  type CreateMeetingInput,
  type AddAgendaItemInput,
  type RecordAttendanceInput,
  type DeclareConflictInput,
  type TableMotionInput,
  type RecordMinutesInput,
  type CreateMeetingActionInput,
} from "./meeting-contract";

function fail(msg: string): never {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "GOVERNANCE_MEETING_DENIED";
  throw err;
}

interface Context {
  traceId?: string;
  correlationId?: string;
}

async function getPresidingMember(principal: Principal, bodyId: string) {
  const [member] = await db
    .select()
    .from(governanceMembers)
    .where(
      and(
        eq(governanceMembers.bodyId, bodyId),
        eq(governanceMembers.partyId, principal.partyId ?? ""),
        eq(governanceMembers.lifecycleStatus, "ACTIVE"),
        inArray(governanceMembers.seatRole, ["CHAIR", "VICE_CHAIR", "SECRETARY"]),
      ),
    );
  if (!member) {
    throw fail("Presiding or secretarial authority on this active body is required.");
  }
  return member;
}

export async function createGovernedMeeting(
  principal: Principal,
  bodyId: string,
  rawInput: CreateMeetingInput,
  ctx: Context = {},
) {
  const input = CreateMeetingInputSchema.parse(rawInput);
  const body = await readGoverningBody(principal, bodyId);
  if (body.status !== "ACTIVE") {
    throw fail("Meetings can only be scheduled for ACTIVE governing bodies.");
  }

  const presider = await getPresidingMember(principal, bodyId);

  const meetingId = newId(ID_PREFIX.governanceMeeting);
  const now = new Date();

  const meeting = {
    id: meetingId,
    tenantId: body.tenantId,
    bodyId: body.id,
    title: input.title,
    meetingType: input.meetingType,
    status: "DRAFT",
    scheduledStartAt: new Date(input.scheduledStartAt),
    scheduledEndAt: new Date(input.scheduledEndAt),
    location: input.location,
    isVirtual: input.isVirtual,
    classification: input.classification,
    presidingMemberId: presider.seatRole === "CHAIR" || presider.seatRole === "VICE_CHAIR" ? presider.id : null,
    secretaryMemberId: presider.seatRole === "SECRETARY" ? presider.id : null,
    quorumRequired: body.quorumMinimum,
    quorumAchieved: false,
    revision: 1,
    createdByUserId: principal.userId,
    createdAt: now,
    updatedAt: now,
  };

  return withAuditTransaction(
    async (tx) => {
      await tx.insert(governanceMeetings).values(meeting);
      return meeting;
    },
    (r) => ({
      action: "GOVERNANCE_MEETING_CREATED",
      objectType: "GOVERNANCE_MEETING",
      objectId: meetingId,
      actorUserId: principal.userId,
      tenantId: body.tenantId,
      details: { title: input.title, meetingType: input.meetingType, bodyId },
    }),
  );
}

export async function issueMeetingNotice(
  principal: Principal,
  meetingId: string,
  noticeDocumentId: string,
  ctx: Context = {},
) {
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "DRAFT") throw fail("Notice can only be issued for meetings in DRAFT status.");

  await getPresidingMember(principal, meeting.bodyId);

  // Validate notice document
  const [doc] = await db.select().from(documents).where(eq(documents.id, noticeDocumentId));
  if (!doc) throw fail("Notice document not found.");

  return withAuditTransaction(
    async (tx) => {
      const [updated] = await tx
        .update(governanceMeetings)
        .set({
          status: "NOTICE_ISSUED",
          noticeDocumentId,
          updatedAt: new Date(),
        })
        .where(eq(governanceMeetings.id, meetingId))
        .returning();
      return updated;
    },
    (r) => ({
      action: "GOVERNANCE_MEETING_NOTICE_ISSUED",
      objectType: "GOVERNANCE_MEETING",
      objectId: meetingId,
      actorUserId: principal.userId,
      tenantId: meeting.tenantId,
      details: { noticeDocumentId },
    }),
  );
}

export async function addMeetingAgendaItem(
  principal: Principal,
  meetingId: string,
  rawInput: AddAgendaItemInput,
  ctx: Context = {},
) {
  const input = AddAgendaItemInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (!["DRAFT", "NOTICE_ISSUED"].includes(meeting.status)) {
    throw fail("Agenda items cannot be added after the agenda has been locked or convened.");
  }

  await getPresidingMember(principal, meeting.bodyId);

  const itemId = newId(ID_PREFIX.meetingAgendaItem);
  const item = {
    id: itemId,
    meetingId,
    itemOrder: input.itemOrder,
    title: input.title,
    description: input.description ?? null,
    itemType: input.itemType,
    leadPartyId: input.leadPartyId ?? null,
    durationMinutes: input.durationMinutes,
    boardPaperDocumentId: input.boardPaperDocumentId ?? null,
    boardPaperChecksum: input.boardPaperChecksum ?? null,
    isConfidential: input.isConfidential,
  };

  await db.insert(governanceMeetingAgendaItems).values(item);
  return item;
}

export async function lockMeetingAgenda(principal: Principal, meetingId: string, ctx: Context = {}) {
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "NOTICE_ISSUED") throw fail("Agenda can only be locked from NOTICE_ISSUED status.");

  await getPresidingMember(principal, meeting.bodyId);

  const items = await db
    .select()
    .from(governanceMeetingAgendaItems)
    .where(eq(governanceMeetingAgendaItems.meetingId, meetingId));
  if (items.length === 0) throw fail("At least one agenda item is required before locking the agenda.");

  const [updated] = await db
    .update(governanceMeetings)
    .set({
      status: "AGENDA_LOCKED",
      updatedAt: new Date(),
    })
    .where(eq(governanceMeetings.id, meetingId))
    .returning();

  return updated;
}

export async function conveneMeeting(principal: Principal, meetingId: string, ctx: Context = {}) {
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "AGENDA_LOCKED") throw fail("Meeting can only be convened from AGENDA_LOCKED status.");

  await getPresidingMember(principal, meeting.bodyId);

  const [updated] = await db
    .update(governanceMeetings)
    .set({
      status: "IN_SESSION",
      actualStartAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(governanceMeetings.id, meetingId))
    .returning();

  return updated;
}

export async function recordMeetingAttendance(
  principal: Principal,
  meetingId: string,
  rawInput: RecordAttendanceInput,
  ctx: Context = {},
) {
  const input = RecordAttendanceInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (!["NOTICE_ISSUED", "AGENDA_LOCKED", "IN_SESSION"].includes(meeting.status)) {
    throw fail("Attendance can only be recorded for upcoming or active sessions.");
  }

  // Validate member belongs to body
  const [member] = await db
    .select()
    .from(governanceMembers)
    .where(and(eq(governanceMembers.id, input.memberId), eq(governanceMembers.bodyId, meeting.bodyId)));
  if (!member) throw fail("Member does not belong to this governing body.");

  const attId = newId(ID_PREFIX.meetingAttendance);
  const now = new Date();

  await db.insert(governanceMeetingAttendance).values({
    id: attId,
    meetingId,
    memberId: member.id,
    partyId: member.partyId,
    attendanceType: input.attendanceType,
    joinedAt: input.joinedAt ? new Date(input.joinedAt) : now,
    leftAt: input.leftAt ? new Date(input.leftAt) : null,
    votingEligible: member.votingRights && ["IN_PERSON", "VIRTUAL"].includes(input.attendanceType),
    recordedByUserId: principal.userId,
    recordedAt: now,
  });

  // Re-evaluate quorum
  const attendees = await db
    .select()
    .from(governanceMeetingAttendance)
    .where(eq(governanceMeetingAttendance.meetingId, meetingId));

  const votingPresent = attendees.filter(
    (a) => a.votingEligible && ["IN_PERSON", "VIRTUAL"].includes(a.attendanceType),
  ).length;

  const quorumAchieved = votingPresent >= meeting.quorumRequired;

  await db
    .update(governanceMeetings)
    .set({ quorumAchieved, updatedAt: now })
    .where(eq(governanceMeetings.id, meetingId));

  return { attendanceId: attId, quorumAchieved, votingPresent, quorumRequired: meeting.quorumRequired };
}

export async function declareMeetingConflict(
  principal: Principal,
  meetingId: string,
  rawInput: DeclareConflictInput,
  ctx: Context = {},
) {
  const input = DeclareConflictInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");

  const [member] = await db
    .select()
    .from(governanceMembers)
    .where(and(eq(governanceMembers.id, input.memberId), eq(governanceMembers.bodyId, meeting.bodyId)));
  if (!member) throw fail("Member does not belong to this governing body.");

  const conflictId = newId(ID_PREFIX.meetingConflict);
  const record = {
    id: conflictId,
    meetingId,
    memberId: member.id,
    partyId: member.partyId,
    agendaItemId: input.agendaItemId ?? null,
    natureOfInterest: input.natureOfInterest,
    conflictType: input.conflictType,
    actionTaken: input.actionTaken,
    recordedByUserId: principal.userId,
    recordedAt: new Date(),
  };

  await db.insert(governanceMeetingConflicts).values(record);
  return record;
}

export async function tableMeetingMotion(
  principal: Principal,
  meetingId: string,
  rawInput: TableMotionInput,
  ctx: Context = {},
) {
  const input = TableMotionInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "IN_SESSION") throw fail("Motions can only be tabled while the meeting is IN_SESSION.");

  const [mover] = await db
    .select()
    .from(governanceMembers)
    .where(
      and(
        eq(governanceMembers.bodyId, meeting.bodyId),
        eq(governanceMembers.partyId, principal.partyId ?? ""),
        eq(governanceMembers.lifecycleStatus, "ACTIVE"),
      ),
    );
  if (!mover) throw fail("Motions can only be moved by active members of this body.");

  const motionId = newId(ID_PREFIX.meetingMotion);
  const motion = {
    id: motionId,
    meetingId,
    agendaItemId: input.agendaItemId ?? null,
    motionText: input.motionText,
    movedByMemberId: mover.id,
    secondedByMemberId: input.secondedByMemberId ?? null,
    motionStatus: input.secondedByMemberId ? "SECONDED" : "PROPOSED",
    linkedResolutionId: input.linkedResolutionId ?? null,
    recordedAt: new Date(),
  };

  await db.insert(governanceMeetingMotions).values(motion);
  return motion;
}

export async function recordMeetingMinutes(
  principal: Principal,
  meetingId: string,
  rawInput: RecordMinutesInput,
  ctx: Context = {},
) {
  const input = RecordMinutesInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "IN_SESSION") throw fail("Minutes can only be recorded for meetings IN_SESSION.");

  await getPresidingMember(principal, meeting.bodyId);

  const [doc] = await db.select().from(documents).where(eq(documents.id, input.minutesDocumentId));
  if (!doc) throw fail("Minutes document not found.");

  const [updated] = await db
    .update(governanceMeetings)
    .set({
      status: "MINUTES_RECORDED",
      minutesDocumentId: input.minutesDocumentId,
      updatedAt: new Date(),
    })
    .where(eq(governanceMeetings.id, meetingId))
    .returning();

  return updated;
}

export async function concludeMeeting(principal: Principal, meetingId: string, ctx: Context = {}) {
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");
  if (meeting.status !== "MINUTES_RECORDED") {
    throw fail("Meetings must have MINUTES_RECORDED before formal conclusion.");
  }

  await getPresidingMember(principal, meeting.bodyId);

  const [updated] = await db
    .update(governanceMeetings)
    .set({
      status: "CONCLUDED",
      actualEndAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(governanceMeetings.id, meetingId))
    .returning();

  return updated;
}

export async function createMeetingAction(
  principal: Principal,
  meetingId: string,
  rawInput: CreateMeetingActionInput,
  ctx: Context = {},
) {
  const input = CreateMeetingActionInputSchema.parse(rawInput);
  const [meeting] = await db.select().from(governanceMeetings).where(eq(governanceMeetings.id, meetingId));
  if (!meeting) throw fail("Governed meeting not found.");

  if (input.independentVerifierPartyId && input.independentVerifierPartyId === input.assigneePartyId) {
    throw fail("Independent verification requires a distinct verifier; implementers cannot self-verify.");
  }

  const actionId = newId(ID_PREFIX.meetingAction);
  const now = new Date();

  const action = {
    id: actionId,
    meetingId,
    agendaItemId: input.agendaItemId ?? null,
    resolutionId: input.resolutionId ?? null,
    actionTitle: input.actionTitle,
    assigneePartyId: input.assigneePartyId,
    dueDate: input.dueDate,
    status: "OPEN",
    independentVerifierPartyId: input.independentVerifierPartyId ?? null,
    verificationEvidenceDocumentId: null,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(governanceMeetingActions).values(action);
  return action;
}
