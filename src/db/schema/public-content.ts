import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { classificationEnum } from "./enums";
import { tenants } from "./core";

/**
 * Public-facing BEYU news and events. Publication is deliberately separate
 * from communications broadcasts: publishing a web article never sends a message.
 * Only PUBLIC + PUBLISHED records are visible through the anonymous feed.
 */
export const publicContent = pgTable("public_content", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull(), // NEWS | EVENT
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  classification: classificationEnum("classification").notNull().default("INTERNAL"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PENDING_APPROVAL | PUBLISHED | ARCHIVED
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("public_content_tenant_status_idx").on(t.tenantId, t.status),
  index("public_content_publication_idx").on(t.classification, t.status, t.publishedAt),
  uniqueIndex("public_content_slug_uidx").on(t.slug),
]);
