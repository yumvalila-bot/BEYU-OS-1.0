import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { governanceCharters } from "./governance-charters";
import { documents } from "./platform";
import { users, parties } from "./identity";
import { classificationEnum } from "./enums";
import type { CharterRules } from "@/lib/governance/charter-contract";
/** Superior-body proposal/evidence, never an alternate membership register. */
export const governanceBodyEstablishments = pgTable("governance_body_establishments", {
 id: text("id").primaryKey(), parentBodyId: text("parent_body_id").notNull().references(() => governanceBodies.id),
 parentCharterId: text("parent_charter_id").notNull().references(() => governanceCharters.id),
 code: text("code").notNull(), name: text("name").notNull(), purpose: text("purpose").notNull(),
 documentId: text("document_id").notNull().references(() => documents.id), documentVersion: text("document_version").notNull(), documentChecksum: text("document_checksum").notNull(),
 classification: classificationEnum("classification").notNull(), rules: jsonb("rules").$type<CharterRules>().notNull(), reservedMatters: jsonb("reserved_matters").$type<string[]>().notNull(),
 status: text("status").notNull().default("DRAFT"), revision: integer("revision").notNull().default(1),
 proposedByUserId: text("proposed_by_user_id").notNull().references(() => users.id), proposedByPartyId: text("proposed_by_party_id").notNull().references(() => parties.id),
 approvedByUserId: text("approved_by_user_id").references(() => users.id), resolutionId: text("resolution_id").references(() => resolutions.id),
 bodyId: text("body_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("governance_body_establishments_body_uidx").on(t.bodyId)]).enableRLS();
