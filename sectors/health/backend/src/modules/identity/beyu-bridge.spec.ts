/**
 * BEYU OS integration — canonical identity bridge integrity.
 *
 * Proves the ONE-GlobalUserID boundary:
 *   - sector users act only under a 1:1 canonical link (fail-closed);
 *   - cross-pairing conflicts are hard errors, never silent re-links;
 *   - constitutional roles/permissions cannot be granted via the sector path;
 *   - tenant canonical boundaries are set-once and context checks are
 *     fail-closed.
 *
 * Engine: real PostgreSQL when TEST_DATABASE_URL is set, else PGlite.
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as bcrypt from "bcryptjs";
import {
  createTestDbConnection,
  type TestDbConnection,
} from "./test-connection";
import { IdentityRepository } from "./identity.repository";
import { BeyuIdentityBridge, CONSTITUTIONAL_ROLE_IDS } from "./beyu-bridge";
import { ensureBridgeSchema, ensureBoundarySchema } from "./boundary-schema";
import { ForbiddenException, ConflictException } from "@nestjs/common";

jest.setTimeout(60_000);

describe("BEYU canonical identity bridge (one GlobalUserID)", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let bridge: BeyuIdentityBridge;
  let sectorUserId: string;
  let otherSectorUserId: string;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    conn = await createTestDbConnection();
    repo = new IdentityRepository(conn);
    bridge = new BeyuIdentityBridge(conn);
    await repo.ensureSchema();
    await ensureBridgeSchema(conn);
    await ensureBoundarySchema(conn);

    const hash = await bcrypt.hash("pw", 10);
    const u = await repo.createUser({
      email: "bridge@a.example",
      displayName: "Bridge A",
      passwordHash: hash,
    });
    sectorUserId = u.global_user_id;
    const u2 = await repo.createUser({
      email: "bridge@b.example",
      displayName: "Bridge B",
      passwordHash: hash,
    });
    otherSectorUserId = u2.global_user_id;
    const t = await repo.createTenant({ code: "BRG-A", name: "Bridge A" });
    tenantId = t.tenant_id;
    const t2 = await repo.createTenant({ code: "BRG-B", name: "Bridge B" });
    otherTenantId = t2.tenant_id;
  });

  afterAll(async () => {
    await conn.close();
  });

  describe("user bridge", () => {
    it("links a sector user to a canonical user and reads it back", async () => {
      const link = await bridge.linkUser({
        globalUserId: sectorUserId,
        beyuUserId: "beyu-user-ceo-001",
        beyuPartyId: "party-ceo-001",
        linkedBy: "admin@beyu.os",
      });
      expect(link.globalUserId).toBe(sectorUserId);
      expect(link.beyuUserId).toBe("beyu-user-ceo-001");
      expect(link.beyuPartyId).toBe("party-ceo-001");

      const readBack = await bridge.requireCanonicalLink(sectorUserId);
      expect(readBack.beyuUserId).toBe("beyu-user-ceo-001");
    });

    it("denies an unlinked sector user (fail-closed)", async () => {
      await expect(
        bridge.requireCanonicalLink(otherSectorUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects linking a nonexistent sector user", async () => {
      await expect(
        bridge.linkUser({
          globalUserId: "00000000-0000-0000-0000-000000000000",
          beyuUserId: "beyu-user-ghost",
          linkedBy: "admin@beyu.os",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects linking a canonical user that is already linked elsewhere", async () => {
      await expect(
        bridge.linkUser({
          globalUserId: otherSectorUserId,
          beyuUserId: "beyu-user-ceo-001",
          linkedBy: "admin@beyu.os",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects silently re-pointing an existing link to a different canonical user", async () => {
      await expect(
        bridge.linkUser({
          globalUserId: sectorUserId,
          beyuUserId: "beyu-user-someone-else",
          linkedBy: "admin@beyu.os",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("allows idempotent re-link of the same pairing", async () => {
      const link = await bridge.linkUser({
        globalUserId: sectorUserId,
        beyuUserId: "beyu-user-ceo-001",
        linkedBy: "admin@beyu.os",
      });
      expect(link.beyuUserId).toBe("beyu-user-ceo-001");
    });
  });

  describe("tenant canonical boundary", () => {
    it("links a tenant to its canonical country/entity boundary", async () => {
      const linked = await bridge.linkTenant({
        tenantId,
        beyuTenantId: "T-BRG-A",
        countryCode: "TZ",
        entityCode: "LE-BRG-A",
        linkedBy: "admin@beyu.os",
      });
      expect(linked.beyuTenantId).toBe("T-BRG-A");
      expect(linked.countryCode).toBe("TZ");
    });

    it("is idempotent for the identical boundary", async () => {
      await bridge.linkTenant({
        tenantId,
        beyuTenantId: "T-BRG-A",
        countryCode: "TZ",
        entityCode: "LE-BRG-A",
        linkedBy: "admin@beyu.os",
      });
    });

    it("rejects silently re-pointing a tenant to a different canonical boundary", async () => {
      await expect(
        bridge.linkTenant({
          tenantId,
          beyuTenantId: "T-OTHER",
          countryCode: "KE",
          entityCode: "LE-OTHER",
          linkedBy: "admin@beyu.os",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("requires the full canonical boundary (no partial linkage)", async () => {
      await expect(
        bridge.linkTenant({
          tenantId: otherTenantId,
          beyuTenantId: "",
          countryCode: "KE",
          entityCode: "LE-X",
          linkedBy: "admin@beyu.os",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("assertContextBoundary: matching context passes", async () => {
      await bridge.linkTenant({
        tenantId: otherTenantId,
        beyuTenantId: "T-BRG-B",
        countryCode: "KE",
        entityCode: "LE-BRG-B",
        linkedBy: "admin@beyu.os",
      });
      await expect(
        bridge.assertContextBoundary(otherTenantId, {
          country: "KE",
          entity: "LE-BRG-B",
        }),
      ).resolves.toBeUndefined();
    });

    it("assertContextBoundary: cross-country context is denied (fail-closed)", async () => {
      await expect(
        bridge.assertContextBoundary(otherTenantId, {
          country: "TZ",
          entity: "LE-BRG-B",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("assertContextBoundary: cross-entity context is denied (fail-closed)", async () => {
      await expect(
        bridge.assertContextBoundary(otherTenantId, {
          country: "KE",
          entity: "LE-OTHER",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("assertContextBoundary: unlinked legacy tenant keeps tenant-only isolation", async () => {
      const t3 = await repo.createTenant({ code: "BRG-L", name: "Legacy" });
      await expect(
        bridge.assertContextBoundary(t3.tenant_id, {
          country: null,
          entity: null,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("governance boundary (sector is not constitutional authority)", () => {
    it("refuses every constitutional role via the sector path", async () => {
      for (const role of CONSTITUTIONAL_ROLE_IDS) {
        expect(() => bridge.assertSectorGrantAllowed(role)).toThrow(
          ForbiddenException,
        );
      }
    });

    it("refuses constitutional permissions via the sector path", async () => {
      expect(() =>
        bridge.assertSectorGrantAllowed("doctor", ["trustee:veto"]),
      ).toThrow(ForbiddenException);
      expect(() =>
        bridge.assertSectorGrantAllowed("doctor", ["board:vote"]),
      ).toThrow(ForbiddenException);
      expect(() =>
        bridge.assertSectorGrantAllowed("doctor", ["contract:sign"]),
      ).toThrow(ForbiddenException);
    });

    it("allows ordinary sector roles and permissions", async () => {
      expect(() =>
        bridge.assertSectorGrantAllowed("doctor", [
          "patient:read",
          "phi:write",
          "note:sign",
        ]),
      ).not.toThrow();
      expect(() =>
        bridge.assertSectorGrantAllowed("auditor", ["audit:read"]),
      ).not.toThrow();
    });
  });
});
