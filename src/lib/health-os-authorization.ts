/**
 * BEYU OS — Health OS Authorization Check
 *
 * Shared utility for checking if a canonical BEYU user has Health OS authorization.
 * This queries the Health backend's identity bridge table (beyu_identity.beyu_identity_links)
 * which links sector users to canonical BEYU users.
 *
 * The table lives in the beyu_identity schema (created by Health backend migration 002).
 *
 * LIFECYCLE (Health migration 031): links carry `status` ∈ {active, revoked,
 * expired}. Only `active` links authorize — the same rule the Health backend's
 * own bridge enforces (BeyuIdentityBridge.requireCanonicalLink). Revocation is
 * a status change, not a row delete, so a gate that ignores `status` would keep
 * authorizing revoked and expired identities. A database without the 031
 * column cannot answer the question and therefore fails closed
 * (AUTHORIZATION_SERVICE_UNAVAILABLE), never open.
 */

import { db } from "@/db";
import { and, eq } from "drizzle-orm";
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
    status: text("status").notNull(),
  }
);

/**
 * Check if a canonical BEYU user has Health OS authorization.
 *
 * A user is authorized for Health OS if they have an ACTIVE canonical identity
 * link in the beyu_identity.beyu_identity_links table.
 *
 * Returns false if:
 * - No link exists (fail-closed)
 * - The link is revoked or expired (fail-closed; reported as NOT_LINKED —
 *   there is no active link)
 * - The table doesn't exist (Health backend not deployed)
 * - Query fails (database error)
 */
let warnedAuthorizationUnavailable = false;

/** The only lifecycle status that authorizes (Health migration 031). */
export const ACTIVE_LINK_STATUS = "active";

export async function checkHealthOSAuthorization(beyuUserId: string): Promise<{
  authorized: boolean;
  sectorUserId?: string;
  linkedAt?: string;
  reason?: "NOT_LINKED" | "AUTHORIZATION_SERVICE_UNAVAILABLE";
}> {
  try {
    // Isolate the optional Health-schema lookup behind its own transaction.
    // When called inside a BEYU request transaction, Drizzle implements this as
    // a savepoint. A missing Health schema can then be rolled back locally
    // before we return the fail-closed result; merely catching PostgreSQL's
    // undefined-table error without a savepoint would leave the parent request
    // transaction aborted and turn otherwise valid BEYU pages into HTTP 500s.
    const link = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(beyuIdentityLinks)
        .where(
          and(
            eq(beyuIdentityLinks.beyuUserId, beyuUserId),
            eq(beyuIdentityLinks.status, ACTIVE_LINK_STATUS),
          ),
        )
        .limit(1);
      return row;
    });

    if (!link) {
      return { authorized: false, reason: "NOT_LINKED" };
    }

    return {
      authorized: true,
      sectorUserId: link.globalUserId,
      linkedAt: link.linkedAt?.toISOString(),
    };
  } catch {
    // Missing Health infrastructure is an availability fact, never evidence
    // that the identity is unlinked. Fail closed without logging query text,
    // identifiers or driver internals; one sanitized process-level warning is
    // enough for operators and avoids flooding logs on every navigation render.
    if (!warnedAuthorizationUnavailable) {
      console.warn("Health OS authorization service unavailable; access is failing closed.");
      warnedAuthorizationUnavailable = true;
    }
    return { authorized: false, reason: "AUTHORIZATION_SERVICE_UNAVAILABLE" };
  }
}
