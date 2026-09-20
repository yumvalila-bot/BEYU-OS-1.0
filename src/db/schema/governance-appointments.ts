import { boolean, date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { governanceBodies, resolutions } from "./governance";
import { governanceCharters } from "./governance-charters";
import { users, parties } from "./identity";
import { documents } from "./platform";
import { classificationEnum } from "./enums";
/** Appointment workflow/provenance, not a second membership or RBAC register. */
export const governanceAppointments = pgTable("governance_appointments", {
 id: text("id").primaryKey(), bodyId: text("body_id").notNull().references(() => governanceBodies.id),
 // NULL authority on pre-0055 rows retains the old, same-body-only semantics.
 authorityBodyId: text("authority_body_id").references(() => governanceBodies.id),
 initialCharterId: text("initial_charter_id").references(() => governanceCharters.id),
 nomineeUserId: text("nominee_user_id").notNull().references(() => users.id),
 partyId: text("party_id").notNull().references(() => parties.id),
 seatRole: text("seat_role").notNull(), votingRights: boolean("voting_rights").notNull(),
 appointedOn: date("appointed_on").notNull(), retiredOn: date("retired_on").notNull(),
 documentId: text("document_id").notNull().references(() => documents.id),
 documentVersion: text("document_version").notNull(), documentChecksum: text("document_checksum").notNull(),
 classification: classificationEnum("classification").notNull(), rationale: text("rationale").notNull(),
 status: text("status").notNull().default("NOMINATED"), revision: integer("revision").notNull().default(1),
 // Nullable only for pre-0054 history; never infer the original person from a mutable account.
 nominatedByPartyId: text("nominated_by_party_id").references(() => parties.id),
 nominatedByUserId: text("nominated_by_user_id").notNull().references(() => users.id),
 approvedByPartyId: text("approved_by_party_id").references(() => parties.id),
 approvedByUserId: text("approved_by_user_id").references(() => users.id),
 resolutionId: text("resolution_id").references(() => resolutions.id),
 acceptedAt: timestamp("accepted_at", { withTimezone: true }),
 activatedByUserId: text("activated_by_user_id").references(() => users.id),
 memberId: text("member_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("governance_appointments_member_uidx").on(t.memberId)]).enableRLS();
