/**
 * BEYU OS — Health OS Authorization Check
 *
 * Shared utility for checking if a canonical BEYU user has Health OS authorization.
 * This queries the Health backend's identity bridge table (beyu_identity.beyu_identity_links)
 * which links sector users to canonical BEYU users.
 *
 * The table lives in the beyu_identity schema (created by Health backend migration 002).
 */

import { db } from "@/db";
import { eq } from "drizzle-orm";
import { pgSchema, uuid, text, timestamp } from "drizzle-orm/pg-core";

// The beyu_identity schema (Health backend's isolation boundary)
const beyuIdentitySchema = pgSchema("beyu_identity");

// Reference to the identity bridge table
const beyuIdentityLinks = beyuIdentitySchema.table(
  "beyu_identity_links",
  {
    globalUserId: uuid("global_user_id").primaryKey(),
    beyuUserId: text("beyu_user_id").notNull().unique(),
    beyuPartyId: text("beyu_party_id"),
    linkedBy: text("linked_by").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Check if a canonical BEYU user has Health OS authorization.
 *
 * A user is authorized for Health OS if they have a canonical identity link
 * in the beyu_identity.beyu_identity_links table.
 *
 * Returns false if:
 * - No link exists (fail-closed)
 * - The table doesn't exist (Health backend not deployed)
 * - Query fails (database error)
 */
export async function checkHealthOSAuthorization(beyuUserId: string): Promise<{
  authorized: boolean;
  sectorUserId?: string;
  linkedAt?: string;
}> {
  try {
    const [link] = await db
      .select()
      .from(beyuIdentityLinks)
      .where(eq(beyuIdentityLinks.beyuUserId, beyuUserId))
      .limit(1);

    if (!link) {
      return { authorized: false };
    }

    return {
      authorized: true,
      sectorUserId: link.globalUserId,
      linkedAt: link.linkedAt?.toISOString(),
    };
  } catch (error) {
    // If schema/table doesn't exist or query fails, assume no Health authorization
    // This can happen if Health backend is not deployed or migrations haven't run
    console.warn("Health OS authorization check failed:", error);
    return { authorized: false };
  }
}
