import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { users, parties } from "./identity";
import { documents } from "./platform";
import { classificationEnum } from "./enums";
/** Immutable requests/evidence; governance_bodies.status remains the canonical projection. */
export const governanceBodyChanges = pgTable("governance_body_changes", {
 id: text("id").primaryKey(),
 bodyId: text("body_id").notNull().references(()=>governanceBodies.id),
 authorityBodyId: text("authority_body_id").notNull().references(()=>governanceBodies.id),
 command: text("command").notNull(), fromStatus: text("from_status").notNull(), toStatus: text("to_status").notNull(),
 bodyRevision: integer("body_revision").notNull(),
 affectedPartyIds: jsonb("affected_party_ids").$type<string[]>().notNull(),
 status: text("status").notNull().default("PROPOSED"),
 documentId: text("document_id").notNull().references(()=>documents.id), documentVersion: text("document_version").notNull(), documentChecksum: text("document_checksum").notNull(),
 classification: classificationEnum("classification").notNull(), rationale: text("rationale").notNull(),
 proposedByUserId: text("proposed_by_user_id").notNull().references(()=>users.id), proposedByPartyId: text("proposed_by_party_id").notNull().references(()=>parties.id),
 appliedByPartyId: text("applied_by_party_id").references(()=>parties.id),
 appliedByUserId: text("applied_by_user_id").references(()=>users.id), resolutionId: text("resolution_id").references(()=>resolutions.id),
 createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(), appliedAt: timestamp("applied_at",{withTimezone:true}),
}).enableRLS();
