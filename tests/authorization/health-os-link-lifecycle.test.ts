/**
 * D-1 regression — the root Health OS gate honours the Health identity-link
 * lifecycle (Health migration 031: status ∈ {active, revoked, expired}).
 *
 * Before this fix `checkHealthOSAuthorization` selected by `beyu_user_id`
 * alone, so a revoked or expired link (revocation is a status change, not a
 * delete) still authorized every consumer of the gate: the /os/health mount,
 * the OS catalog, both authorization-context APIs and the viz adapters.
 *
 * The query is rendered through drizzle's real PostgreSQL dialect (offline
 * `drizzle.mock()`), so these assertions pin the SQL actually sent to the
 * database, not a hand-written approximation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Rendered = { sql: string; params: unknown[] };

const state = vi.hoisted(() => ({
  rendered: [] as { sql: string; params: unknown[] }[],
  rows: [] as Record<string, unknown>[],
  fail: null as Error | null,
}));

vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const offline = drizzle.mock();
  // Forwards to the real query builder; `.limit()` renders the final SQL and
  // resolves with the scripted rows instead of touching a network.
  const tx = {
    select: (...args: unknown[]) => {
      const qb = (offline.select as (...a: unknown[]) => any)(...args);
      return {
        from: (table: unknown) => {
          const fromQb = qb.from(table);
          return {
            where: (cond: unknown) => {
              const whereQb = fromQb.where(cond);
              return {
                limit: async (n: number) => {
                  state.rendered.push(whereQb.limit(n).toSQL());
                  if (state.fail) throw state.fail;
                  return state.rows;
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) },
  };
});

import {
  ACTIVE_LINK_STATUS,
  checkHealthOSAuthorization,
} from "@/lib/health-os-authorization";

const lastQuery = (): Rendered => state.rendered[state.rendered.length - 1];

describe("checkHealthOSAuthorization — link lifecycle (D-1)", () => {
  beforeEach(() => {
    state.rendered.length = 0;
    state.rows = [];
    state.fail = null;
  });

  it("filters on status = 'active' in the SQL sent to PostgreSQL", async () => {
    await checkHealthOSAuthorization("BEYU-USER-1");
    const q = lastQuery();
    expect(q.sql).toMatch(/from "beyu_identity"\."beyu_identity_links"/);
    expect(q.sql).toMatch(/"beyu_identity_links"\."beyu_user_id" = \$1/);
    expect(q.sql).toMatch(/"beyu_identity_links"\."status" = \$2/);
    expect(q.sql).toMatch(/ and /);
    expect(q.params).toEqual(["BEYU-USER-1", "active", 1]);
    expect(ACTIVE_LINK_STATUS).toBe("active");
  });

  it("authorizes only when an active link row is returned", async () => {
    const linkedAt = new Date("2026-09-01T00:00:00Z");
    state.rows = [
      {
        globalUserId: "11111111-1111-4111-8111-111111111111",
        beyuUserId: "BEYU-USER-1",
        linkedBy: "federation",
        linkedAt,
        status: "active",
      },
    ];
    await expect(checkHealthOSAuthorization("BEYU-USER-1")).resolves.toEqual({
      authorized: true,
      sectorUserId: "11111111-1111-4111-8111-111111111111",
      linkedAt: linkedAt.toISOString(),
    });
  });

  it("a revoked or expired link (filtered out by the status predicate) is NOT_LINKED", async () => {
    // PostgreSQL returns no row for `status = 'active'` when the only link is
    // revoked/expired; the gate must deny.
    state.rows = [];
    await expect(checkHealthOSAuthorization("BEYU-REVOKED")).resolves.toEqual({
      authorized: false,
      reason: "NOT_LINKED",
    });
  });

  it("a pre-031 schema (no status column) fails closed as UNAVAILABLE, never open", async () => {
    state.fail = Object.assign(new Error('column "status" does not exist'), {
      code: "42703",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(checkHealthOSAuthorization("BEYU-USER-1")).resolves.toEqual({
      authorized: false,
      reason: "AUTHORIZATION_SERVICE_UNAVAILABLE",
    });
    // Sanitized: no query text, identifier or driver detail is logged.
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toMatch(/status|BEYU-USER-1|42703/);
    }
    warn.mockRestore();
  });

  it("source pins the lifecycle column in the table definition and the predicate", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "health-os-authorization.ts"),
      "utf8",
    );
    expect(src).toMatch(/status:\s*text\("status"\)\.notNull\(\)/);
    expect(src).toMatch(/eq\(beyuIdentityLinks\.status,\s*ACTIVE_LINK_STATUS\)/);
  });
});
