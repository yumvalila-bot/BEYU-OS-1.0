import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { idempotencyRecords, tenants, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import {
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  hashRequest,
  idempotencyScope,
  releaseIdempotencyKey,
} from "../../src/lib/idempotency";

/**
 * A-01 regression suite.
 *
 * The previous implementation was an in-process `Map` keyed only on the raw
 * Idempotency-Key header. Measured behaviour before this fix:
 *   - a different actor reusing a key received the FIRST actor's response body,
 *   - a different payload under the same key silently replayed the old result,
 *   - two concurrent requests with the same key both committed.
 * Each of those is asserted against here.
 */

const ENDPOINT = "governance.resolutions.propose";

async function principalFor(userKey: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, userKey)));
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

beforeEach(async () => {
  await db.execute(sql`delete from idempotency_records`);
});

describe("A-01 governed idempotency", () => {
  it("scopes a key to the acting principal and tenant", async () => {
    const governance = await principalFor("GRACE_KILELE");
    const cfo = await principalFor("DAUDI_MOSHI");

    const a = idempotencyScope(governance, ENDPOINT);
    const b = idempotencyScope(cfo, ENDPOINT);

    expect(a).not.toBe(b);
    expect(a).toContain(governance.userId);
    expect(a).toContain(governance.tenantId);
    // The endpoint is part of the scope, so a key cannot cross endpoints.
    expect(idempotencyScope(governance, "other.endpoint")).not.toBe(a);
  });

  it("claims a key, then replays the identical request without re-executing", async () => {
    const p = await principalFor("GRACE_KILELE");
    const payload = { bodyId: "GOV_GROUP_BOARD", title: "Replay probe" };

    const first = await claimIdempotencyKey(p, ENDPOINT, "key-replay", payload);
    expect(first.kind).toBe("PROCEED");
    if (first.kind !== "PROCEED") return;

    await completeIdempotencyKey(first, 201, { data: { reference: "GROUP_BOARD-2026-001" } });

    const second = await claimIdempotencyKey(p, ENDPOINT, "key-replay", payload);
    expect(second.kind).toBe("REPLAY");
    if (second.kind !== "REPLAY") return;
    expect(second.statusCode).toBe(201);
    expect(second.body).toEqual({ data: { reference: "GROUP_BOARD-2026-001" } });
  });

  it("rejects the same key with a different payload instead of replaying", async () => {
    const p = await principalFor("GRACE_KILELE");

    const first = await claimIdempotencyKey(p, ENDPOINT, "key-mismatch", { title: "original" });
    expect(first.kind).toBe("PROCEED");
    if (first.kind !== "PROCEED") return;
    await completeIdempotencyKey(first, 201, { data: { reference: "R-1" } });

    const different = await claimIdempotencyKey(p, ENDPOINT, "key-mismatch", { title: "changed" });
    expect(different.kind).toBe("MISMATCH");
  });

  it("never returns one actor's response to another actor reusing the key", async () => {
    const governance = await principalFor("GRACE_KILELE");
    const cfo = await principalFor("DAUDI_MOSHI");
    const payload = { title: "shared payload" };

    const first = await claimIdempotencyKey(governance, ENDPOINT, "shared-key", payload);
    expect(first.kind).toBe("PROCEED");
    if (first.kind !== "PROCEED") return;
    await completeIdempotencyKey(first, 201, { data: { secret: "governance-only" } });

    // Same key, same payload, DIFFERENT principal — must not replay.
    const other = await claimIdempotencyKey(cfo, ENDPOINT, "shared-key", payload);
    expect(other.kind).toBe("PROCEED");
    expect(other.kind).not.toBe("REPLAY");

    const rows = await db.select().from(idempotencyRecords);
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.scope)).size).toBe(2);
  });

  it("serialises concurrent claims so only one caller proceeds", async () => {
    const p = await principalFor("GRACE_KILELE");
    const payload = { title: "concurrent" };

    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimIdempotencyKey(p, ENDPOINT, "key-concurrent", payload)),
    );

    const proceeded = results.filter((r) => r.kind === "PROCEED");
    expect(proceeded.length).toBe(1);
    expect(results.filter((r) => r.kind === "IN_FLIGHT").length).toBe(7);

    const rows = await db.select().from(idempotencyRecords);
    expect(rows.length).toBe(1);
  });

  it("releases a claim when the mutation fails so a retry can proceed", async () => {
    const p = await principalFor("GRACE_KILELE");
    const payload = { title: "failing" };

    const claim = await claimIdempotencyKey(p, ENDPOINT, "key-release", payload);
    expect(claim.kind).toBe("PROCEED");
    if (claim.kind !== "PROCEED") return;

    await releaseIdempotencyKey(claim);
    expect((await db.select().from(idempotencyRecords)).length).toBe(0);

    const retry = await claimIdempotencyKey(p, ENDPOINT, "key-release", payload);
    expect(retry.kind).toBe("PROCEED");
  });

  it("never releases a completed response", async () => {
    const p = await principalFor("GRACE_KILELE");
    const claim = await claimIdempotencyKey(p, ENDPOINT, "key-final", { t: 1 });
    expect(claim.kind).toBe("PROCEED");
    if (claim.kind !== "PROCEED") return;

    await completeIdempotencyKey(claim, 201, { data: "final" });
    await releaseIdempotencyKey(claim); // must be a no-op for COMPLETED

    const [row] = await db.select().from(idempotencyRecords);
    expect(row.state).toBe("COMPLETED");
  });

  it("treats a missing key as non-idempotent rather than failing", async () => {
    const p = await principalFor("GRACE_KILELE");
    expect((await claimIdempotencyKey(p, ENDPOINT, null, {})).kind).toBe("NO_KEY");
    expect((await claimIdempotencyKey(p, ENDPOINT, "   ", {})).kind).toBe("NO_KEY");
  });

  it("hashes payloads canonically so key order does not matter", () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
  });

  it("persists the claim durably rather than in process memory", async () => {
    const p = await principalFor("GRACE_KILELE");
    const claim = await claimIdempotencyKey(p, ENDPOINT, "key-durable", { t: 1 });
    expect(claim.kind).toBe("PROCEED");

    // Read back through a fresh query — the record lives in PostgreSQL, so it
    // survives a process restart and is shared across replicas.
    const rows = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from idempotency_records where idempotency_key = 'key-durable'`,
    );
    expect(Number(rows.rows[0].n)).toBe(1);
  });
});
