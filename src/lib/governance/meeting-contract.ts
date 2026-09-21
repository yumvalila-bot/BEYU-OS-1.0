import { z } from "zod";
import { CLASSIFICATION_ORDER, type Classification } from "../constants";

export const MEETING_TYPES = [
  "ORDINARY",
  "EXTRAORDINARY",
  "ANNUAL_GENERAL",
  "COMMITTEE_SESSION",
  "EMERGENCY",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_STATUSES = [
  "DRAFT",
  "NOTICE_ISSUED",
  "AGENDA_LOCKED",
  "IN_SESSION",
  "DELIBERATION",
  "MINUTES_RECORDED",
  "CONCLUDED",
  "ADJOURNED",
  "CANCELLED",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const ATTENDANCE_TYPES = [
  "IN_PERSON",
  "VIRTUAL",
  "APOLOGY",
  "ABSENT",
  "RECUSED",
] as const;
export type AttendanceType = (typeof ATTENDANCE_TYPES)[number];

export const AGENDA_ITEM_TYPES = [
  "INFORMATION",
  "DISCUSSION",
  "DECISION_RESOLUTION",
  "ADMINISTRATIVE",
] as const;
export type AgendaItemType = (typeof AGENDA_ITEM_TYPES)[number];

export const CONFLICT_TYPES = [
  "PECUNIARY",
  "PERSONAL",
  "DIRECTORSHIP",
  "FAMILIAL",
  "OTHER",
] as const;
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const CONFLICT_ACTIONS = [
  "RECUSED_FROM_DISCUSSION_AND_VOTE",
  "RECUSED_FROM_VOTE_ONLY",
  "DECLARED_NO_RECUSAL_REQUIRED",
] as const;
export type ConflictAction = (typeof CONFLICT_ACTIONS)[number];

export const MOTION_STATUSES = [
  "PROPOSED",
  "SECONDED",
  "DEBATED",
  "ADOPTED_INTO_RESOLUTION",
  "WITHDRAWN",
  "REJECTED",
] as const;
export type MotionStatus = (typeof MOTION_STATUSES)[number];

export const ACTION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "IMPLEMENTED",
  "VERIFIED_CLOSED",
  "CANCELLED",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const CreateMeetingInputSchema = z.object({
  title: z.string().trim().min(5).max(300),
  meetingType: z.enum(MEETING_TYPES).default("ORDINARY"),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  location: z.string().trim().min(3).max(200).default("Boardroom / Virtual Hybrid"),
  isVirtual: z.boolean().default(false),
  classification: z.enum(CLASSIFICATION_ORDER).default("INTERNAL"),
}).strict();
export type CreateMeetingInput = z.input<typeof CreateMeetingInputSchema>;
export type ParsedCreateMeetingInput = z.infer<typeof CreateMeetingInputSchema>;

export const AddAgendaItemInputSchema = z.object({
  itemOrder: z.number().int().positive(),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).optional(),
  itemType: z.enum(AGENDA_ITEM_TYPES).default("DISCUSSION"),
  leadPartyId: z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().positive().default(15),
  boardPaperDocumentId: z.string().min(1).max(100).optional(),
  boardPaperChecksum: z.string().min(10).max(200).optional(),
  isConfidential: z.boolean().default(false),
}).strict();
export type AddAgendaItemInput = z.input<typeof AddAgendaItemInputSchema>;
export type ParsedAddAgendaItemInput = z.infer<typeof AddAgendaItemInputSchema>;

export const RecordAttendanceInputSchema = z.object({
  memberId: z.string().min(1).max(100),
  attendanceType: z.enum(ATTENDANCE_TYPES),
  joinedAt: z.string().datetime().optional(),
  leftAt: z.string().datetime().optional(),
}).strict();
export type RecordAttendanceInput = z.input<typeof RecordAttendanceInputSchema>;
export type ParsedRecordAttendanceInput = z.infer<typeof RecordAttendanceInputSchema>;

export const DeclareConflictInputSchema = z.object({
  memberId: z.string().min(1).max(100),
  agendaItemId: z.string().min(1).max(100).optional(),
  natureOfInterest: z.string().trim().min(5).max(1000),
  conflictType: z.enum(CONFLICT_TYPES).default("PECUNIARY"),
  actionTaken: z.enum(CONFLICT_ACTIONS).default("RECUSED_FROM_DISCUSSION_AND_VOTE"),
}).strict();
export type DeclareConflictInput = z.input<typeof DeclareConflictInputSchema>;
export type ParsedDeclareConflictInput = z.infer<typeof DeclareConflictInputSchema>;

export const TableMotionInputSchema = z.object({
  agendaItemId: z.string().min(1).max(100).optional(),
  motionText: z.string().trim().min(10).max(2000),
  secondedByMemberId: z.string().min(1).max(100).optional(),
  linkedResolutionId: z.string().min(1).max(100).optional(),
}).strict();
export type TableMotionInput = z.input<typeof TableMotionInputSchema>;
export type ParsedTableMotionInput = z.infer<typeof TableMotionInputSchema>;

export const RecordMinutesInputSchema = z.object({
  minutesDocumentId: z.string().min(1).max(100),
  minutesDocumentChecksum: z.string().min(10).max(200),
  summary: z.string().trim().min(10).max(5000),
}).strict();
export type RecordMinutesInput = z.input<typeof RecordMinutesInputSchema>;
export type ParsedRecordMinutesInput = z.infer<typeof RecordMinutesInputSchema>;

export const CreateMeetingActionInputSchema = z.object({
  agendaItemId: z.string().min(1).max(100).optional(),
  resolutionId: z.string().min(1).max(100).optional(),
  actionTitle: z.string().trim().min(5).max(300),
  assigneePartyId: z.string().min(1).max(100),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  independentVerifierPartyId: z.string().min(1).max(100).optional(),
}).strict();
export type CreateMeetingActionInput = z.input<typeof CreateMeetingActionInputSchema>;
export type ParsedCreateMeetingActionInput = z.infer<typeof CreateMeetingActionInputSchema>;
