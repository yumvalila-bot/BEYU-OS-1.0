import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { documents } from "./platform";
import { parties, users } from "./identity";
import { classificationEnum } from "./enums";
import type { CharterRules } from "@/lib/governance/charter-contract";
/** Immutable versions of a body's charter. Latest adopted version is current;
 * earlier adopted records remain history, not editable authority pointers. */
export const governanceCharters = pgTable("governance_charters", {
  id: text("id").primaryKey(),
  bodyId: text("body_id").notNull().references(() => governanceBodies.id),
  // Nullable only for preserved pre-0053 history; new writes require both.
  authorityBodyId: text("authority_body_id").references(() => governanceBodies.id),
  createdByPartyId: text("created_by_party_id").references(() => parties.id),
  version: integer("version").notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status").notNull().default("DRAFT"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  adoptedByUserId: text("adopted_by_user_id").references(() => users.id),
  resolutionId: text("resolution_id").references(() => resolutions.id),
  adoptedAt: timestamp("adopted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("governance_charters_body_version_uidx").on(t.bodyId, t.version)]).enableRLS();

/** Classified contents are separate from the minimal control header: hiding
 * terms must deny evaluation, never make an adopted charter look absent. */
export const governanceCharterTerms = pgTable("governance_charter_terms", {
  id: text("id").primaryKey().references(() => governanceCharters.id, { onDelete: "restrict" }),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  documentVersion: text("document_version").notNull(),
  documentChecksum: text("document_checksum").notNull(),
  purpose: text("purpose").notNull(),
  rules: jsonb("rules").$type<CharterRules>().notNull(),
  classification: classificationEnum("classification").notNull(),

}).enableRLS();
