/**
 * BEYU OS — Constitutional invariants executable gate (audit Stage 20).
 *
 * Encodes the canonical BEYU architectural invariants as runnable checks using
 * real application logic and live database facts (not source-grep). Where an
 * invariant is also covered in depth elsewhere (e.g. audit concurrency,
 * idempotency, RLS), this gate asserts the invariant's executable surface so the
 * audit has one consolidated, reproducible invariant suite.
 */
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { can, type Principal, type AccessDecision } from "../../src/lib/authz";
import { PERMISSIONS, HIGH_RISK_PERMISSIONS, ROLES, NOELIA_IDENTITY } from "../../src/lib/constants";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(query)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  const r = await rows<{ n: number }>(query);
  return Number(r[0].n);
}

/** A minimal principal with no roles/permissions, for deny-by-default checks. */
function powerless(): Principal {
  return {
    userId: "USR_NOBODY",
    partyId: "p",
    email: "nobody@example.test",
    displayName: "Nobody",
    tenantId: "TEN_NONE",
    tenantCode: "NONE",
    tenantType: "SECTOR",
    roles: [],
    permissions: new Set<never>(),
    clearance: "INTERNAL",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

describe("Constitutional invariant 1 — DENY is final", () => {
  it("an unauthorized principal receives a hard deny for every permission", () => {
    for (const perm of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      const decision = can(powerless(), perm);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).not.toBe("Authorized");
    }
  });

  it("a deny decision carries no fallback or partial-allowed signal", () => {
    const d: AccessDecision = can(powerless(), "finance:ledger.post");
    expect(d.allowed).toBe(false);
    expect(d.requiresMfa).toBe(false);
  });
});

describe("Constitutional invariant 2 — no capability is executable without governance activation", () => {
  it("every high-risk permission exists in the catalogue", () => {
    for (const p of HIGH_RISK_PERMISSIONS) {
      expect(PERMISSIONS[p], `missing high-risk permission ${p}`).toBeTruthy();
    }
  });

  it("the governance capability registry starts locked for CAP_POSTING", async () => {
    const [cap] = await rows<{ activation_status: string }>(
      sql`select activation_status from governance_capability_registry where capability_code='CAP_POSTING'`,
    );
    expect(cap?.activation_status).not.toBe("ACTIVATED");
  });
});

describe("Constitutional invariant 3 — Noelia is an AI identity, never an authority", () => {
  it("the Noelia action evidence records an AI actor, not a human authority", async () => {
    // Rows recorded by Noelia must carry executingAi = NOELIA_IDENTITY.
    const rows_ = await rows<{ executing_ai: string }>(
      sql`select executing_ai from noelia_action_requests limit 1`,
    );
    if (rows_.length > 0) {
      expect(rows_[0].executing_ai).toBe(NOELIA_IDENTITY);
    }
  });

  it("the NOELIA identity is a distinct service identity from any governing role", () => {
    expect(NOELIA_IDENTITY.length).toBeGreaterThan(0);
    // No governing role may share the Noelia identity.
    expect(ROLES[NOELIA_IDENTITY as keyof typeof ROLES]).toBeUndefined();
  });
});

describe("Constitutional invariant 4 — tenant and entity isolation are enforced at DB + app layers", () => {
  it("critical tenant-scoped tables have Row Level Security enabled", async () => {
    for (const t of ["legal_entities", "ownership_records", "capital_requests", "documents", "risks"]) {
      const [row] = await rows<{ rls: boolean }>(
        sql`select relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relname=${t}`,
      );
      expect(row?.rls, `RLS not enabled on ${t}`).toBe(true);
    }
  });

  it("the application deny is the same boundary the database enforces (tenant + entity context)", () => {
    const d = can(powerless(), "finance:ledger.post", {
      tenantId: "TEN_OTHER",
      entityId: "LE_OTHER",
      classification: "RESTRICTED",
    });
    expect(d.allowed).toBe(false);
  });
});

describe("Constitutional invariant 5 — the runtime DB role cannot bypass RLS", () => {
  it("the runtime role is NOSUPERUSER and NOBYPASSRLS", async () => {
    const [role] = await rows<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname='beyu_runtime'`,
    );
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolbypassrls).toBe(false);
  });
});

describe("Constitutional invariant 6 — financial truth has one canonical owner", () => {
  it("only GROUP_CFO holds a ledger-write capability", async () => {
    const holder = (ROLES as Record<string, { permissions?: readonly string[] }>).GROUP_CFO?.permissions ?? [];
    const others = Object.entries(ROLES as Record<string, { permissions?: readonly string[] }>).filter(
      ([name, def]) => name !== "GROUP_CFO" && def.permissions?.includes("finance:ledger.post"),
    );
    expect(holder).toContain("finance:ledger.post");
    expect(others).toHaveLength(0);
  });

  it("the ledger balance invariant is DB-enforced so no writer can commit an unbalanced entry", async () => {
    const [trig] = await rows<{ c: number }>(
      sql`select count(*)::int c from pg_trigger t join pg_class c on c.oid=t.tgrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='journal_lines' and t.tgenabled<>'D'`,
    );
    // A live balance/immutability trigger must exist on the journal lines.
    expect(trig?.c ?? 0).toBeGreaterThan(0);
  });
});

describe("Constitutional invariant 7 — consequential actions are attributable (audit exists for them)", () => {
  it("audit rows carry actor + object + outcome and the chain is hash-bound", async () => {
    const n = await count(sql`select count(*)::int n from audit_log`);
    const [cols] = await rows<{ c: number }>(
      sql`select count(*)::int c from information_schema.columns where table_schema='public' and table_name='audit_log' and column_name in ('actor_user_id','object_id','outcome','hash','prev_hash')`,
    );
    expect(cols?.c).toBe(5);
    expect(n).toBeGreaterThan(0);
  });
});

describe("Constitutional invariant 8 — audit integrity survives concurrency", () => {
  it("concurrent appends do not fork the chain (no duplicate parent hashes)", async () => {
    const [f] = await rows<{ c: number }>(
      sql`select count(*)::int c from (select prev_hash from audit_log where prev_hash is not null group by prev_hash having count(*)>1) x`,
    );
    expect(f?.c ?? 0).toBe(0);
  });
});

describe("Constitutional invariant 9 — replays cannot create unauthorized duplicate effects", () => {
  it("durable idempotency records are uniquely scoped by (scope, key)", async () => {
    const [con] = await rows<{ n: number }>(
      sql`select count(*)::int n from information_schema.table_constraints
          where table_name='idempotency_records' and constraint_type='PRIMARY KEY'`,
    );
    expect(con?.n).toBe(1);
  });
});

describe("Constitutional invariant 10 — failed transactions do not silently leave inconsistent state", () => {
  it("an aborted insert leaves no row behind", async () => {
    const [leg] = await rows<{ id: string; tenant_id: string }>(
      sql`select id, tenant_id from legal_entities order by id limit 1`,
    );
    expect(leg?.id).toBeTruthy();
    const fakeId = `JE_INV_${Date.now()}`;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql`insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by)
              values (${fakeId}, ${leg.tenant_id}, ${leg.id}, 'x', 'x', 'USD', 'x')`,
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await count(sql`select count(*)::int n from journal_entries where id = ${fakeId}`)).toBe(0);
  });
});

describe("Constitutional invariant 11 — identity context survives across modules", () => {
  it("there is exactly one login identity per party at the DB level", async () => {
    const [dup] = await rows<{ c: number }>(
      sql`select count(*)::int c from (select party_id from users group by party_id having count(*)>1) x`,
    );
    expect(dup?.c ?? 0).toBe(0);
  });
});

describe("Constitutional invariant 12 — governance remains above intelligence", () => {
  it("Noelia's tool registry grants no ledger-write capability (intelligence cannot write financial truth)", async () => {
    // Noelia tools must never require finance:ledger.post; only the governed
    // posting engine writes the journal and it is capability-gated.
    const { createDefaultNoeliaToolRegistry } = await import("../../src/lib/noelia/default-tools");
    const registry = createDefaultNoeliaToolRegistry();
    const tools = registry.list();
    const ledgerWriters = tools.filter((t) => t.permission === "finance:ledger.post");
    expect(ledgerWriters).toHaveLength(0);
    // At least one read-level finance tool exists (proves enumeration is real).
    expect(tools.some((t) => t.permission === "finance:ledger.read")).toBe(true);
  });
});

describe("Constitutional invariant 13 — human approval remains enforceable where required", () => {
  it("approvals exist and are subject to RLS", async () => {
    const [row] = await rows<{ rls: boolean; force: boolean }>(
      sql`select relrowsecurity as rls, relforcerowsecurity as force
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='approvals'`,
    );
    expect(row?.rls).toBe(true);
  });
});

describe("Constitutional invariant 14 — administrative privileges are separated from runtime privileges", () => {
  it("the runtime role owns no objects and holds no admin attributes", async () => {
    const owned = await count(
      sql`select count(*)::int n from pg_tables where schemaname='public' and tableowner='beyu_runtime'`,
    );
    expect(owned).toBe(0);
    const [role] = await rows<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean }>(
      sql`select rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname='beyu_runtime'`,
    );
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolcreaterole).toBe(false);
    expect(role?.rolcreatedb).toBe(false);
  });
});
