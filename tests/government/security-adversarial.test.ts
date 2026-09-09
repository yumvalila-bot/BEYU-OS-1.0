/**
 * Government Integration Fabric — adversarial security suite.
 *
 * Attacks executed against the REAL runtime role (NON-SUPERUSER, RLS-bound),
 * mirroring tests/security/rls-isolation.test.ts:
 *   - cross-tenant read/write of government submissions;
 *   - runtime-role tampering with the government registry (must be denied);
 *   - fabricating ACCEPTED without a government reference (DB CHECK);
 *   - promoting an agency to LIVE without human approval (DB CHECK);
 *   - deleting submission history via the runtime role (must be denied);
 *   - Noelia structural boundary: no tool can transmit to a government system.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { governmentSubmissions, legalEntities, tenants } from "@/db/schema";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { newId, ID_PREFIX } from "@/lib/ids";

const RUN = `GOVSEC${Date.now()}`;

function runtimeDsn(): string | null {
  return process.env.BEYU_RUNTIME_DATABASE_URL ?? null;
}
function adminDsn(): string | null {
  return process.env.BEYU_ADMIN_DATABASE_URL ?? null;
}

let tenantA: string;
let tenantB: string;
let entityB: string;
let victimId: string;

beforeAll(async () => {
  const rows = await db.select({ id: tenants.id }).from(tenants).limit(3);
  expect(rows.length).toBeGreaterThanOrEqual(2);
  tenantA = rows[0].id;
  tenantB = rows[1].id;
  const [le] = await db
    .select({ id: legalEntities.id })
    .from(legalEntities)
    .where(eq(legalEntities.tenantId, tenantB))
    .limit(1);
  entityB = le?.id ?? "";
  if (!entityB) {
    // fall back: any entity, retargeting tenantB to that entity's tenant
    const [any] = await db.select({ id: legalEntities.id, t: legalEntities.tenantId }).from(legalEntities).limit(1);
    entityB = any.id;
    tenantB = any.t;
  }
  // Victim row in tenant B, created via the privileged test handle.
  victimId = newId(ID_PREFIX.integration);
  await db.insert(governmentSubmissions).values({
    id: victimId,
    tenantId: tenantB,
    legalEntityId: entityB,
    agencyCode: "MOCK_GOV_SANDBOX",
    submissionType: "MOCK",
    status: "SUBMITTED",
    payloadDigest: "victim-digest",
    idempotencyKey: `${RUN}-victim`,
  });
});

afterAll(async () => {
  await db.delete(governmentSubmissions).where(eq(governmentSubmissions.id, victimId)).catch(() => undefined);
  await pool.end().catch(() => undefined);
});

describe("runtime-role RLS isolation (government_submissions)", () => {
  it.skipIf(!runtimeDsn())("tenant A cannot read tenant B's government submissions", async () => {
    const client = new Client({ connectionString: runtimeDsn()! });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('beyu.current_tenant_ids',$1,true), set_config('beyu.global_scope','off',true)", [tenantA]);
      const seen = await client.query("SELECT count(*)::int AS n FROM government_submissions WHERE id=$1", [victimId]);
      expect(seen.rows[0].n).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });

  it.skipIf(!runtimeDsn())("tenant A cannot rewrite tenant B's submission status", async () => {
    const client = new Client({ connectionString: runtimeDsn()! });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('beyu.current_tenant_ids',$1,true), set_config('beyu.global_scope','off',true)", [tenantA]);
      const res = await client.query("UPDATE government_submissions SET status='FAILED' WHERE id=$1", [victimId]);
      expect(res.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
    const [row] = await db.select().from(governmentSubmissions).where(eq(governmentSubmissions.id, victimId));
    expect(row.status).toBe("SUBMITTED");
  });

  it.skipIf(!runtimeDsn())("tenant A cannot forge a submission INTO tenant B (WITH CHECK)", async () => {
    const client = new Client({ connectionString: runtimeDsn()! });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('beyu.current_tenant_ids',$1,true), set_config('beyu.global_scope','off',true)", [tenantA]);
      await expect(
        client.query(
          `INSERT INTO government_submissions (id,tenant_id,legal_entity_id,agency_code,submission_type,status,payload_digest,idempotency_key)
           VALUES ($1,$2,$3,'MOCK_GOV_SANDBOX','MOCK','DRAFT','forged',$4)`,
          [newId(ID_PREFIX.integration), tenantB, entityB, `${RUN}-forge`],
        ),
      ).rejects.toThrow(/row-level security/i);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });

  it.skipIf(!runtimeDsn())("the runtime role cannot erase government interaction history (no DELETE grant)", async () => {
    const client = new Client({ connectionString: runtimeDsn()! });
    await client.connect();
    try {
      await expect(client.query("DELETE FROM government_submissions WHERE id=$1", [victimId])).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await client.end();
    }
  });

  it.skipIf(!runtimeDsn())("the runtime role cannot tamper with the government registry at all", async () => {
    const client = new Client({ connectionString: runtimeDsn()! });
    await client.connect();
    try {
      await expect(
        client.query("UPDATE government_agencies SET integration_status='SANDBOX_READY' WHERE code='TRA_VFD'"),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query("INSERT INTO government_agencies (code,name,country_code,category) VALUES ($1,'Rogue','TZ','OTHER_MDA')", [
          `ROGUE_${RUN}`,
        ]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.end();
    }
  });
});

describe("fabrication is unrepresentable at the database layer", () => {
  it.skipIf(!adminDsn())("ACCEPTED without a government reference violates a CHECK even for the admin role", async () => {
    const client = new Client({ connectionString: adminDsn()! });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO government_submissions (id,tenant_id,legal_entity_id,agency_code,submission_type,status,payload_digest,idempotency_key)
           VALUES ($1,$2,$3,'MOCK_GOV_SANDBOX','MOCK','ACCEPTED','d',$4)`,
          [newId(ID_PREFIX.integration), tenantB, entityB, `${RUN}-fake-accept`],
        ),
      ).rejects.toThrow(/government_submissions_accept_needs_reference/);
    } finally {
      await client.end();
    }
  });

  it.skipIf(!adminDsn())("promoting an agency to LIVE without recorded human approval violates a CHECK", async () => {
    const client = new Client({ connectionString: adminDsn()! });
    await client.connect();
    try {
      await expect(
        client.query("UPDATE government_agencies SET integration_status='LIVE', uat_evidence='x' WHERE code='MOCK_GOV_SANDBOX'"),
      ).rejects.toThrow(/government_agencies_prod_needs_approval/);
    } finally {
      await client.end();
    }
  });

  it.skipIf(!adminDsn())("declaring EXTERNAL_BLOCKED without naming the blocker violates a CHECK", async () => {
    const client = new Client({ connectionString: adminDsn()! });
    await client.connect();
    try {
      await expect(
        client.query(
          "UPDATE government_agencies SET integration_status='EXTERNAL_BLOCKED', blocked_reason=NULL WHERE code='MOCK_GOV_SANDBOX'",
        ),
      ).rejects.toThrow(/government_agencies_blocked_needs_reason/);
    } finally {
      await client.end();
    }
  });
});

describe("Noelia structural boundary", () => {
  it("no Noelia tool carries government submission authority — autonomous government action is unreachable", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const submitters = registry
      .list()
      .filter((tool) => tool.registered && tool.permission === "government:submission.manage");
    expect(submitters).toEqual([]);
  });

  it("the government status tool is read-only, LOW risk and side-effect free", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const tool = registry.list().find((t) => t.name === "government.integration.status");
    expect(tool?.registered).toBe(true);
    expect(tool?.permission).toBe("government:integration.read");
    expect(tool?.risk).toBe("LOW");
    expect(tool?.metadata.sideEffects).toBe("NONE");
  });
});
