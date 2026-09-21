import { z } from "zod";
import { CLASSIFICATION_ORDER, type Classification } from "../constants";

export const CALENDAR_EVENT_TYPES = [
  "BOARD_MEETING",
  "COMMITTEE_SESSION",
  "ANNUAL_GENERAL_MEETING",
  "STATUTORY_FILING_DEADLINE",
  "CHARTER_EXPIRATION_REVIEW",
  "TENURE_RENEWAL_WINDOW",
  "EVALUATION_DEADLINE",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_EVENT_STATUSES = [
  "UPCOMING",
  "NOTICE_SENT",
  "COMPLETED",
  "ESCALATED",
  "CANCELLED",
] as const;
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

export const ESCALATION_LEVELS = [
  "LEVEL_1_WARNING",
  "LEVEL_2_URGENT",
  "LEVEL_3_CRITICAL_BREACH",
] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

export const ESCALATION_TRIGGER_REASONS = [
  "NOTICE_OVERDUE",
  "QUORUM_DEFICIT",
  "STATUTORY_FILING_IMMINENT",
  "CHARTER_EXPIRED",
  "UNVERIFIED_ACTIONS_OVERDUE",
] as const;
export type EscalationTriggerReason = (typeof ESCALATION_TRIGGER_REASONS)[number];

export const ESCALATION_STATUSES = [
  "ACTIVE",
  "ACKNOWLEDGED",
  "RESOLVED",
] as const;
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];

export const CreateCalendarEventSchema = z.object({
  eventType: z.enum(CALENDAR_EVENT_TYPES).default("BOARD_MEETING"),
  title: z.string().trim().min(5).max(300),
  description: z.string().trim().max(2000).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  noticeRequiredDays: z.number().int().nonnegative().default(14),
  linkedMeetingId: z.string().min(1).max(100).optional(),
  linkedResolutionId: z.string().min(1).max(100).optional(),
  classification: z.enum(CLASSIFICATION_ORDER).default("INTERNAL"),
}).strict();
export type CreateCalendarEventInput = z.input<typeof CreateCalendarEventSchema>;
export type ParsedCreateCalendarEventInput = z.infer<typeof CreateCalendarEventSchema>;

export const AcknowledgeEscalationSchema = z.object({
  escalationId: z.string().min(1).max(100),
  note: z.string().trim().min(5).max(1000).optional(),
}).strict();
export type AcknowledgeEscalationInput = z.infer<typeof AcknowledgeEscalationSchema>;

export const ResolveEscalationSchema = z.object({
  escalationId: z.string().min(1).max(100),
  resolutionNote: z.string().trim().min(5).max(2000),
}).strict();
export type ResolveEscalationInput = z.infer<typeof ResolveEscalationSchema>;
