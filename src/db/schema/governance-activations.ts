import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { governanceCharters } from "./governance-charters";
import { parties, users } from "./identity";
import { classificationEnum } from "./enums";
/** Immutable activation mandate, not another body or membership register. */
export const governanceBodyActivations = pgTable("governance_body_activations", {
 id: text("id").primaryKey(), bodyId: text("body_id").notNull().references(() => governanceBodies.id),
 authorityBodyId: text("authority_body_id").notNull().references(() => governanceBodies.id),
 initialCharterId: text("initial_charter_id").notNull().references(() => governanceCharters.id),
 nominationIds: jsonb("nomination_ids").$type<string[]>().notNull(),
 rationale: text("rationale").notNull(), classification: classificationEnum("classification").notNull(),
 status: text("status").notNull().default("DRAFT"), revision: integer("revision").notNull().default(1),
 proposedByUserId: text("proposed_by_user_id").notNull().references(() => users.id),
 proposedByPartyId: text("proposed_by_party_id").notNull().references(() => parties.id),
 approvedByUserId: text("approved_by_user_id").references(() => users.id),
 approvedByPartyId: text("approved_by_party_id").references(() => parties.id),
 resolutionId: text("resolution_id").references(() => resolutions.id),
 activatedByUserId: text("activated_by_user_id").references(() => users.id),
 activatedAt: timestamp("activated_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
