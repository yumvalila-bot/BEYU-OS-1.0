/** Evidence links extend canonical tasks and Documents; never copy document truth. */
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tasks } from "./governance";
import { documents } from "./platform";
import { users } from "./identity";

export const governanceActionEvidence = pgTable("governance_action_evidence", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  documentVersion: text("document_version").notNull(),
  documentChecksum: text("document_checksum").notNull(),
  note: text("note").notNull(),
  submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("governance_evidence_task_idx").on(t.taskId),
  uniqueIndex("governance_evidence_document_uidx").on(t.taskId, t.documentId, t.documentVersion, t.documentChecksum),
]).enableRLS();
