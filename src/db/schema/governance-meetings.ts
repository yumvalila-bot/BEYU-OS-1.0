import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { governanceBodies, governanceMembers, resolutions } from "./governance";
import { users, parties } from "./identity";
import { documents } from "./platform";
import { tenants } from "./core";
import { classificationEnum } from "./enums";

export const governanceMeetings = pgTable("governance_meetings", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bodyId: text("body_id").notNull().references(() => governanceBodies.id),
  title: text("title").notNull(),
  meetingType: text("meeting_type").notNull().default("ORDINARY"),
  status: text("status").notNull().default("DRAFT"),
  scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }).notNull(),
  scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }).notNull(),
  actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
  actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
  location: text("location").notNull().default("Boardroom / Virtual Hybrid"),
  isVirtual: boolean("is_virtual").notNull().default(false),
  classification: classificationEnum("classification").notNull().default("INTERNAL"),
  noticeDocumentId: text("notice_document_id").references(() => documents.id),
  minutesDocumentId: text("minutes_document_id").references(() => documents.id),
  presidingMemberId: text("presiding_member_id").references(() => governanceMembers.id),
  secretaryMemberId: text("secretary_member_id").references(() => governanceMembers.id),
  quorumRequired: integer("quorum_required").notNull(),
  quorumAchieved: boolean("quorum_achieved").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceMeetingAgendaItems = pgTable("governance_meeting_agenda_items", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => governanceMeetings.id),
  itemOrder: integer("item_order").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull().default("DISCUSSION"),
  leadPartyId: text("lead_party_id").references(() => parties.id),
  durationMinutes: integer("duration_minutes").notNull().default(15),
  boardPaperDocumentId: text("board_paper_document_id").references(() => documents.id),
  boardPaperChecksum: text("board_paper_checksum"),
  linkedResolutionId: text("linked_resolution_id").references(() => resolutions.id),
  isConfidential: boolean("is_confidential").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceMeetingAttendance = pgTable("governance_meeting_attendance", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => governanceMeetings.id),
  memberId: text("member_id").notNull().references(() => governanceMembers.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  attendanceType: text("attendance_type").notNull().default("IN_PERSON"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
  votingEligible: boolean("voting_eligible").notNull().default(true),
  recordedByUserId: text("recorded_by_user_id").notNull().references(() => users.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceMeetingConflicts = pgTable("governance_meeting_conflicts", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => governanceMeetings.id),
  memberId: text("member_id").notNull().references(() => governanceMembers.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  agendaItemId: text("agenda_item_id").references(() => governanceMeetingAgendaItems.id),
  natureOfInterest: text("nature_of_interest").notNull(),
  conflictType: text("conflict_type").notNull().default("PECUNIARY"),
  actionTaken: text("action_taken").notNull().default("RECUSED_FROM_DISCUSSION_AND_VOTE"),
  recordedByUserId: text("recorded_by_user_id").notNull().references(() => users.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceMeetingMotions = pgTable("governance_meeting_motions", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => governanceMeetings.id),
  agendaItemId: text("agenda_item_id").references(() => governanceMeetingAgendaItems.id),
  motionText: text("motion_text").notNull(),
  movedByMemberId: text("moved_by_member_id").notNull().references(() => governanceMembers.id),
  secondedByMemberId: text("seconded_by_member_id").references(() => governanceMembers.id),
  motionStatus: text("motion_status").notNull().default("PROPOSED"),
  linkedResolutionId: text("linked_resolution_id").references(() => resolutions.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceMeetingActions = pgTable("governance_meeting_actions", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => governanceMeetings.id),
  agendaItemId: text("agenda_item_id").references(() => governanceMeetingAgendaItems.id),
  resolutionId: text("resolution_id").references(() => resolutions.id),
  actionTitle: text("action_title").notNull(),
  assigneePartyId: text("assignee_party_id").notNull().references(() => parties.id),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("OPEN"),
  independentVerifierPartyId: text("independent_verifier_party_id").references(() => parties.id),
  verificationEvidenceDocumentId: text("verification_evidence_document_id").references(() => documents.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
