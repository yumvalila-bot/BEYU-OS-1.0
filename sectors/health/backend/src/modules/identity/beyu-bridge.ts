import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { DB_CONNECTION, type DbConnection } from "./db-connection";
import { ensureBridgeSchema } from "./boundary-schema";

/**
 * BEYU canonical identity bridge (BEYU OS integration).
 *
 * One canonical BEYU GlobalUserID. The Health sector's `global_user_id` is a
 * DOMAIN identifier: it stays exactly as created, but it can only act once it
 * is linked 1:1 to the canonical BEYU user (and party). There is no second
 * competing global identity system — the link is the integration boundary.
 *
 * Rules enforced here (and mirrored at the database layer):
 *  - a sector user without a canonical link CANNOT act (fail-closed);
 *  - one sector user ↔ one canonical user (uniqueness both directions);
 *  - a canonical user already linked to another sector user cannot be
 *    re-linked silently (explicit conflict);
 *  - a tenant's canonical boundary (tenant/country/entity) can be set exactly
 *    once and never silently re-pointed;
 *  - constitutional roles/permissions (trustee, board, general-counsel and
 *    their veto/vote/contract powers) can NEVER be granted through the sector
 *    path — they require a BEYU governance resolution. A sector is an
 *    execution layer, not a constitutional authority.
 */

/** Roles that carry constitutional authority in the BEYU ecosystem. */
export const CONSTITUTIONAL_ROLE_IDS = new Set([
  "trustee",
  "board",
  "general-counsel",
]);

/** Permissions that carry constitutional authority in the BEYU ecosystem. */
export const CONSTITUTIONAL_PERMISSION_IDS = new Set([
  "trustee:veto",
  "board:vote",
  "contract:sign",
  "contract:anchor",
]);

export interface CanonicalUserLink {
  globalUserId: string;
  beyuUserId: string;
  beyuPartyId: string | null;
  linkedBy: string;
  linkedAt: string;
}

export interface CanonicalTenantLink {
  tenantId: string;
  beyuTenantId: string;
  countryCode: string;
  entityCode: string;
}

@Injectable()
export class BeyuIdentityBridge {
  constructor(@Inject(DB_CONNECTION) private readonly conn: DbConnection) {}

  /** Idempotent: ensure the bridge objects exist (mirrors migration 002). */
  async ensureBridgeSchema(): Promise<void> {
    await ensureBridgeSchema(this.conn);
  }

  // ── USER BRIDGE ────────────────────────────────────────────────────────────

  /**
   * Link a sector domain user to the canonical BEYU user. Idempotent for the
   * same pairing; conflicts (cross-pairing) are thrown, never overwritten.
   */
  async linkUser(args: {
    globalUserId: string;
    beyuUserId: string;
    beyuPartyId?: string | null;
    linkedBy: string;
  }): Promise<CanonicalUserLink> {
    if (!args.beyuUserId || !args.beyuUserId.trim()) {
      throw new ConflictException("CANONICAL_USER_REQUIRED");
    }
    const sectorUser = await this.conn.query(
      `select global_user_id from beyu_identity.users where global_user_id = $1`,
      [args.globalUserId],
    );
    if (sectorUser.length === 0) {
      throw new ConflictException("SECTOR_USER_NOT_FOUND");
    }
    const byCanonical = await this.conn.query<{ global_user_id: string }>(
      `select global_user_id from beyu_identity.beyu_identity_links where beyu_user_id = $1`,
      [args.beyuUserId],
    );
    if (
      byCanonical.length > 0 &&
      byCanonical[0].global_user_id !== args.globalUserId
    ) {
      throw new ConflictException("CANONICAL_USER_ALREADY_LINKED");
    }
    const bySector = await this.conn.query<{ beyu_user_id: string }>(
      `select beyu_user_id from beyu_identity.beyu_identity_links where global_user_id = $1`,
      [args.globalUserId],
    );
    if (bySector.length > 0 && bySector[0].beyu_user_id !== args.beyuUserId) {
      throw new ConflictException("SECTOR_USER_ALREADY_LINKED");
    }
    await this.conn.query(
      `insert into beyu_identity.beyu_identity_links
         (global_user_id, beyu_user_id, beyu_party_id, linked_by)
       values ($1, $2, $3, $4)
       on conflict (global_user_id) do update
         set beyu_user_id = excluded.beyu_user_id,
             beyu_party_id = excluded.beyu_party_id,
             linked_by    = excluded.linked_by`,
      [
        args.globalUserId,
        args.beyuUserId,
        args.beyuPartyId ?? null,
        args.linkedBy,
      ],
    );
    const link = await this.getLink(args.globalUserId);
    if (!link) throw new ConflictException("LINK_NOT_PERSISTED");
    return link;
  }

  /** Read the canonical link for a sector user (null when unlinked). */
  async getLink(globalUserId: string): Promise<CanonicalUserLink | null> {
    const rows = await this.conn.query<{
      global_user_id: string;
      beyu_user_id: string;
      beyu_party_id: string | null;
      linked_by: string;
      linked_at: Date | string;
    }>(
      `select global_user_id, beyu_user_id, beyu_party_id, linked_by, linked_at
         from beyu_identity.beyu_identity_links where global_user_id = $1`,
      [globalUserId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      globalUserId: r.global_user_id,
      beyuUserId: r.beyu_user_id,
      beyuPartyId: r.beyu_party_id,
      linkedBy: r.linked_by,
      linkedAt:
        typeof r.linked_at === "string"
          ? r.linked_at
          : r.linked_at.toISOString(),
    };
  }

  /**
   * Fail-closed session gate: a sector user may only act under a valid
   * canonical link. No link → denied.
   */
  async requireCanonicalLink(globalUserId: string): Promise<CanonicalUserLink> {
    const link = await this.getLink(globalUserId);
    if (!link) {
      throw new ForbiddenException("NO_CANONICAL_IDENTITY_LINK");
    }
    return link;
  }

  // ── TENANT BRIDGE (isolation boundary) ─────────────────────────────────────

  /**
   * Link a sector tenant to its canonical BEYU tenant and record the
   * canonical country/entity isolation attributes. Set-once semantics: an
   * existing, different boundary is a hard conflict (never silently re-pointed).
   */
  async linkTenant(args: {
    tenantId: string;
    beyuTenantId: string;
    countryCode: string;
    entityCode: string;
    linkedBy: string;
  }): Promise<CanonicalTenantLink> {
    if (!args.beyuTenantId || !args.countryCode || !args.entityCode) {
      throw new ConflictException("CANONICAL_TENANT_BOUNDARY_REQUIRED");
    }
    const rows = await this.conn.query<{
      beyu_tenant_id: string | null;
      country_code: string | null;
      entity_code: string | null;
    }>(
      `select tenant_id, beyu_tenant_id, country_code, entity_code
         from beyu_identity.tenants where tenant_id = $1`,
      [args.tenantId],
    );
    if (rows.length === 0) {
      throw new ConflictException("SECTOR_TENANT_NOT_FOUND");
    }
    const cur = rows[0];
    if (
      cur.beyu_tenant_id !== null &&
      (cur.beyu_tenant_id !== args.beyuTenantId ||
        cur.country_code !== args.countryCode ||
        cur.entity_code !== args.entityCode)
    ) {
      throw new ConflictException("TENANT_BOUNDARY_CONFLICT");
    }
    await this.conn.query(
      `update beyu_identity.tenants
          set beyu_tenant_id = $2, country_code = $3, entity_code = $4
        where tenant_id = $1`,
      [args.tenantId, args.beyuTenantId, args.countryCode, args.entityCode],
    );
    return {
      tenantId: args.tenantId,
      beyuTenantId: args.beyuTenantId,
      countryCode: args.countryCode,
      entityCode: args.entityCode,
    };
  }

  /**
   * Application-layer mirror of the RLS boundary: the acting context
   * (country + entity) must match the linked tenant's canonical boundary.
   * Unlinked (legacy) tenants retain tenant-only isolation (documented).
   */
  async assertContextBoundary(
    tenantId: string,
    ctx: { country: string | null; entity: string | null },
  ): Promise<void> {
    const rows = await this.conn.query<{
      beyu_tenant_id: string | null;
      country_code: string | null;
      entity_code: string | null;
    }>(
      `select beyu_tenant_id, country_code, entity_code
         from beyu_identity.tenants where tenant_id = $1`,
      [tenantId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException("TENANT_NOT_FOUND");
    }
    const t = rows[0];
    if (t.beyu_tenant_id === null) return; // legacy tenant: tenant-only boundary
    if (ctx.country !== t.country_code || ctx.entity !== t.entity_code) {
      throw new ForbiddenException("CROSS_BOUNDARY_TENANT_ACCESS");
    }
  }

  // ── GOVERNANCE BOUNDARY ────────────────────────────────────────────────────

  /**
   * A sector may never self-grant constitutional authority. Grants of
   * constitutional roles/permissions through the sector path are refused
   * outright; only a BEYU governance resolution can authorize them.
   */
  assertSectorGrantAllowed(role: string, permissions: string[] = []): void {
    if (CONSTITUTIONAL_ROLE_IDS.has(role)) {
      throw new ForbiddenException("CONSTITUTIONAL_ROLE_REQUIRES_BEVU_GOV");
    }
    for (const p of permissions) {
      if (CONSTITUTIONAL_PERMISSION_IDS.has(p)) {
        throw new ForbiddenException(
          "CONSTITUTIONAL_PERMISSION_REQUIRES_BEVU_GOV",
        );
      }
    }
  }
}
