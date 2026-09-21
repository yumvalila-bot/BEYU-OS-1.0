import { boolean, date, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { governanceMeetings } from "./governance-meetings";
import { users, parties } from "./identity";
import { documents } from "./platform";
import { tenants } from "./core";
import { classificationEnum } from "./enums";

export const governanceCalendarEvents = pgTable("governance_calendar_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bodyId: text("body_id").notNull().references(() => governanceBodies.id),
  eventType: text("event_type").notNull().default("BOARD_MEETING"),
  title: text("title").notNull(),
  description: text("description"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  noticeRequiredDays: integer("notice_required_days").notNull().default(14),
  noticeDispatched: boolean("notice_dispatched").notNull().default(false),
  noticeDeadlineDate: text("notice_deadline_date").notNull(),
  status: text("status").notNull().default("UPCOMING"),
  linkedMeetingId: text("linked_meeting_id").references(() => governanceMeetings.id),
  linkedResolutionId: text("linked_resolution_id").references(() => resolutions.id),
  classification: classificationEnum("classification").notNull().default("INTERNAL"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceEscalations = pgTable("governance_escalations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bodyId: text("body_id").notNull().references(() => governanceBodies.id),
  eventId: text("event_id").references(() => governanceCalendarEvents.id),
  escalationLevel: text("escalation_level").notNull().default("LEVEL_1_WARNING"),
  triggerReason: text("trigger_reason").notNull(),
  targetPartyIds: jsonb("target_party_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("ACTIVE"),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedByUserId: text("acknowledged_by_user_id").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}).enableRLS();

export const governanceEvaluations = pgTable("governance_evaluations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bodyId: text("body_id").notNull().references(() => governanceBodies.id),
  evaluationType: text("evaluation_type").notNull().default("ANNUAL_BOARD_EFFECTIVENESS"),
  evaluationPeriod: text("evaluation_period").notNull(),
  status: text("status").notNull().default("DRAFT"),
  overallScore: integer("overall_score"),
  dimensionScores: jsonb("dimension_scores").$type<Record<string, number>>().notNull().default({}),
  findings: jsonb("findings").$type<string[]>().notNull().default([]),
  recommendations: jsonb("recommendations").$type<string[]>().notNull().default([]),
  documentId: text("document_id").references(() => documents.id),
  conductedByUserId: text("conducted_by_user_id").notNull().references(() => users.id),
  conductedOn: text("conducted_on").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const governanceLegalHolds = pgTable("governance_legal_holds", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bodyId: text("body_id").references(() => governanceBodies.id),
  holdTitle: text("hold_title").notNull(),
  holdReason: text("hold_reason").notNull(),
  matterReference: text("matter_reference").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  appliedByUserId: text("applied_by_user_id").notNull().references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  releasedByUserId: text("released_by_user_id").references(() => users.id),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releaseJustification: text("release_justification"),
}).enableRLS();
