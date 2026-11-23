import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const runtimeUrl = process.env.BEYU_RUNTIME_DATABASE_URL;
const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const canRun = Boolean(runtimeUrl && adminUrl);

describe.skipIf(!canRun)("public_content database-level RLS, maker-checker CHECK, and anonymous feed isolation", () => {
  let admin: Client;
  let runtime: Client;
  const testPrefix = `pub_rls_${Date.now()}`;
  const tenantA = `TEN_A_${testPrefix}`;
  const tenantB = `TEN_B_${testPrefix}`;
  const ids: string[] = [];

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    runtime = new Client({ connectionString: runtimeUrl });
    await admin.connect();
    await runtime.connect();

    // Ensure two isolated tenants exist for the test
    await admin.query(
      `INSERT INTO tenants (id, code, name, type, status)
       VALUES ($1, $2, 'Tenant A Public Content Test', 'LEGAL_ENTITY', 'ACTIVE'),
              ($3, $4, 'Tenant B Public Content Test', 'LEGAL_ENTITY', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [tenantA, `CODE_A_${testPrefix}`, tenantB, `CODE_B_${testPrefix}`],
    );

    const rows = [
      // 1. Draft INTERNAL row in Tenant A -> must NEVER be readable anonymously
      {
        id: `ART_DRAFT_${testPrefix}`,
        tenantId: tenantA,
        slug: `draft-${testPrefix}`,
        classification: "INTERNAL",
        status: "DRAFT",
        createdBy: "USR_AUTHOR_A",
        approvedBy: null,
        publishedAt: null,
      },
      // 2. Pending PUBLIC row in Tenant A -> must NEVER be readable anonymously
      {
        id: `ART_PENDING_${testPrefix}`,
        tenantId: tenantA,
        slug: `pending-${testPrefix}`,
        classification: "PUBLIC",
        status: "PENDING_APPROVAL",
        createdBy: "USR_AUTHOR_A",
        approvedBy: null,
        publishedAt: null,
      },
      // 3. Approved PUBLIC PUBLISHED row in Tenant A -> MUST be readable anonymously
      {
        id: `ART_PUB_${testPrefix}`,
        tenantId: tenantA,
        slug: `published-${testPrefix}`,
        classification: "PUBLIC",
        status: "PUBLISHED",
        createdBy: "USR_AUTHOR_A",
        approvedBy: "USR_APPROVER_A",
        publishedAt: new Date(Date.now() - 60_000),
      },
      // 4. Archived PUBLIC row in Tenant A -> must NEVER be readable anonymously
      {
        id: `ART_ARCH_${testPrefix}`,
        tenantId: tenantA,
        slug: `archived-${testPrefix}`,
        classification: "PUBLIC",
        status: "ARCHIVED",
        createdBy: "USR_AUTHOR_A",
        approvedBy: "USR_APPROVER_A",
        publishedAt: new Date(Date.now() - 60_000),
      },
      // 5. Draft INTERNAL row in Tenant B -> must NEVER leak to Tenant A or anonymous
      {
        id: `ART_TENB_${testPrefix}`,
        tenantId: tenantB,
        slug: `tenant-b-draft-${testPrefix}`,
        classification: "CONFIDENTIAL",
        status: "DRAFT",
        createdBy: "USR_AUTHOR_B",
        approvedBy: null,
        publishedAt: null,
      },
    ];

    for (const row of rows) {
      ids.push(row.id);
      await admin.query(
        `INSERT INTO public_content
           (id, tenant_id, kind, title, slug, summary, body, classification, status, created_by, approved_by, approved_at, published_at)
         VALUES ($1, $2, 'NEWS', $3, $4, 'Governed summary for automated verification.', 'Full verified body content for RLS check.', $5, $6, $7, $8, $9, $9)`,
        [
          row.id,
          row.tenantId,
          `Title ${row.slug}`,
          row.slug,
          row.classification,
          row.status,
          row.createdBy,
          row.approvedBy,
          row.publishedAt,
        ],
      );
    }
  });

  afterAll(async () => {
    if (admin) {
      if (ids.length > 0) {
        await admin.query(`DELETE FROM public_content WHERE id = ANY($1)`, [ids]);
      }
      await admin.query(`DELETE FROM tenants WHERE id = ANY($1)`, [[tenantA, tenantB]]);
      await admin.end();
    }
    if (runtime) await runtime.end();
  });

  it("exposes ONLY explicitly PUBLIC + PUBLISHED rows when queried anonymously via constrained beyu_runtime role", async () => {
    await runtime.query("BEGIN");
    try {
      const { rows } = await runtime.query<{ id: string; status: string; classification: string }>(
        `SELECT id, status, classification FROM public_content WHERE id = ANY($1)`,
        [ids],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: `ART_PUB_${testPrefix}`,
        status: "PUBLISHED",
        classification: "PUBLIC",
      });
    } finally {
      await runtime.query("ROLLBACK");
    }
  });

  it("isolates Tenant A drafts from Tenant B under beyu_runtime RLS", async () => {
    await runtime.query("BEGIN");
    try {
      await runtime.query(`SELECT set_config('beyu.current_tenant_ids', $1, true)`, [tenantA]);
      await runtime.query(`SELECT set_config('beyu.global_scope', 'off', true)`);
      const { rows } = await runtime.query<{ id: string }>(
        `SELECT id FROM public_content WHERE id = ANY($1) ORDER BY id`,
        [ids],
      );
      const visible = rows.map((r) => r.id);
      expect(visible).toContain(`ART_DRAFT_${testPrefix}`);
      expect(visible).toContain(`ART_PENDING_${testPrefix}`);
      expect(visible).toContain(`ART_PUB_${testPrefix}`);
      expect(visible).not.toContain(`ART_TENB_${testPrefix}`);
    } finally {
      await runtime.query("ROLLBACK");
    }
  });

  it("blocks self-approval and non-PUBLIC publication at the database CHECK constraint level", async () => {
    await expect(
      admin.query(
        `INSERT INTO public_content
           (id, tenant_id, kind, title, slug, summary, body, classification, status, created_by, approved_by, published_at)
         VALUES ($1, $2, 'NEWS', 'Self Approved Attempt', $3, 'Summary text long enough.', 'Body text long enough for validation.', 'PUBLIC', 'PUBLISHED', 'USR_SAME', 'USR_SAME', now())`,
        [`ART_SELF_${testPrefix}`, tenantA, `self-${testPrefix}`],
      ),
    ).rejects.toThrow(/public_content_publish_governance_ck/);

    await expect(
      admin.query(
        `INSERT INTO public_content
           (id, tenant_id, kind, title, slug, summary, body, classification, status, created_by, approved_by, published_at)
         VALUES ($1, $2, 'NEWS', 'Internal Published Attempt', $3, 'Summary text long enough.', 'Body text long enough for validation.', 'INTERNAL', 'PUBLISHED', 'USR_A', 'USR_B', now())`,
        [`ART_INTPUB_${testPrefix}`, tenantA, `intpub-${testPrefix}`],
      ),
    ).rejects.toThrow(/public_content_publish_governance_ck/);
  });

  it("denies DELETE privilege on public_content to beyu_runtime (immutability / archive-only lifecycle)", async () => {
    await runtime.query("BEGIN");
    try {
      await runtime.query(`SELECT set_config('beyu.current_tenant_ids', $1, true)`, [tenantA]);
      await expect(
        runtime.query(`DELETE FROM public_content WHERE id = $1`, [`ART_DRAFT_${testPrefix}`]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await runtime.query("ROLLBACK");
    }
  });
});
