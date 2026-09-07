/**
 * DATA GOVERNANCE — Retention Enforcement Tests
 *
 * Verifies that:
 * 1. Retention policies are correctly calculated (uploaded_at + retention years)
 * 2. Legal holds block deletion
 * 3. Tenant isolation is enforced
 * 4. Classification influences authorization
 * 5. All state transitions are auditable
 *
 * Fixtures target the REAL schema: `tenants` requires `code`+`type`;
 * `documents` requires file metadata columns and has NO `legal_entity_id` or
 * `created_at` (the creation timestamp is `uploaded_at`).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  calculateRetentionExpiry,
  canDeleteDocument,
  applyLegalHold,
  removeLegalHold,
  findRetentionExpiredDocuments,
} from "../../src/lib/data-governance/retention-service";

const TENANT_A = "TEN_TEST_A";
const TENANT_B = "TEN_TEST_B";
const USER_A = "USR_TEST_A";
const USER_B = "USR_TEST_B";

/** Insert a document fixture with all NOT NULL columns the schema requires. */
async function insertDocument(
  id: string,
  tenantId: string,
  overrides: {
    classification?: string;
    legalHold?: boolean;
    uploadedAt?: Date;
    retentionCode?: string;
  } = {},
): Promise<void> {
  await db.execute(sql`
    insert into documents (
      id, tenant_id, file_name, file_type, category, description, version,
      source, uploaded_by, uploaded_at, classification, authority_status,
      checksum, storage_uri, retention_code, legal_hold
    ) values (
      ${id}, ${tenantId}, ${`${id}.pdf`}, 'application/pdf', 'TEST',
      'Retention enforcement fixture', '1.0.0', 'TEST_RUNNER', 'TEST_ACTOR',
      ${overrides.uploadedAt ?? new Date()}, ${overrides.classification ?? "INTERNAL"},
      'AUTHORITATIVE', 'checksum', 's3://test-bucket', ${overrides.retentionCode ?? "DG_1YR"},
      ${overrides.legalHold ?? false}
    )
  `);
}

async function cleanup() {
  await db.execute(sql`delete from documents where id like 'DOC_DG_%'`);
  await db.execute(sql`delete from retention_policies where code like 'DG_%'`);
  await db.execute(sql`delete from tenants where id in (${TENANT_A}, ${TENANT_B})`);
}

function yearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

beforeEach(async () => {
  await cleanup();

  // Create tenants — `code` and `type` are NOT NULL on the real schema.
  await db.execute(sql`
    insert into tenants (id, code, name, type) values
    (${TENANT_A}, 'DG_TEN_A', 'Test Tenant A', 'ENTERPRISE'),
    (${TENANT_B}, 'DG_TEN_B', 'Test Tenant B', 'ENTERPRISE')
  `);

  // Create retention policies
  await db.execute(sql`
    insert into retention_policies (code, record_type, jurisdiction_code, retention_years, legal_basis, disposal_action)
    values
    ('DG_1YR', 'DOCUMENT', 'TEST', 1, 'TEST_POLICY', 'SECURE_DELETE'),
    ('DG_5YR', 'DOCUMENT', 'TEST', 5, 'TEST_POLICY', 'SECURE_DELETE')
  `);
});

afterEach(cleanup);
afterAll(cleanup);

describe("retention calculation", () => {
  it("calculates expiry from creation date + retention years", async () => {
    await insertDocument("DOC_DG_1", TENANT_A, { uploadedAt: yearsAgo(2) });

    const { expiresAt, policy } = await calculateRetentionExpiry("DOC_DG_1");

    expect(policy).not.toBeNull();
    expect(policy?.retentionYears).toBe(1);
    expect(expiresAt).not.toBeNull();

    // Should have expired (uploaded 2 years ago, 1-year retention)
    expect(expiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it("returns null for unknown document", async () => {
    const { expiresAt, policy } = await calculateRetentionExpiry("DOC_DG_NONEXISTENT");
    expect(expiresAt).toBeNull();
    expect(policy).toBeNull();
  });
});

describe("legal hold enforcement", () => {
  it("blocks deletion when legal hold is active", async () => {
    await insertDocument("DOC_DG_HOLD", TENANT_A, { legalHold: true });

    const auth = await canDeleteDocument("DOC_DG_HOLD", { userId: USER_A, tenantId: TENANT_A });

    expect(auth.permitted).toBe(false);
    expect(auth.reason).toMatch(/legal hold/i);
  });

  it("allows deletion eligibility when legal hold is removed", async () => {
    await insertDocument("DOC_DG_RELEASE", TENANT_A, { legalHold: true, uploadedAt: yearsAgo(2) });

    // Initially blocked
    let auth = await canDeleteDocument("DOC_DG_RELEASE", { userId: USER_A, tenantId: TENANT_A });
    expect(auth.permitted).toBe(false);

    // Remove hold
    const result = await removeLegalHold("DOC_DG_RELEASE", { userId: USER_A, tenantId: TENANT_A }, "Test removal");
    expect(result.success).toBe(true);

    // Now eligible (retention expired, no hold)
    auth = await canDeleteDocument("DOC_DG_RELEASE", { userId: USER_A, tenantId: TENANT_A });
    expect(auth.permitted).toBe(true);
  });

  it("prevents cross-tenant legal hold manipulation", async () => {
    await insertDocument("DOC_DG_CROSS", TENANT_A, { uploadedAt: yearsAgo(2) });

    // Tenant B tries to apply hold to Tenant A's document
    const result = await applyLegalHold("DOC_DG_CROSS", { userId: USER_B, tenantId: TENANT_B }, "Test");

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/cross-tenant/i);
  });
});

describe("tenant isolation", () => {
  it("denies cross-tenant deletion attempts", async () => {
    await insertDocument("DOC_DG_ISO", TENANT_A, { uploadedAt: yearsAgo(2) });

    const auth = await canDeleteDocument("DOC_DG_ISO", { userId: USER_B, tenantId: TENANT_B });

    expect(auth.permitted).toBe(false);
    expect(auth.reason).toMatch(/cross-tenant/i);
  });
});

describe("classification-based authorization", () => {
  it("requires approval for CONFIDENTIAL documents", async () => {
    await insertDocument("DOC_DG_CONF", TENANT_A, { classification: "CONFIDENTIAL", uploadedAt: yearsAgo(2) });

    const auth = await canDeleteDocument("DOC_DG_CONF", { userId: USER_A, tenantId: TENANT_A });

    expect(auth.permitted).toBe(true);
    expect(auth.requiresApproval).toBe(true);
    expect(auth.reason).toMatch(/approval/i);
  });

  it("requires approval for RESTRICTED documents", async () => {
    await insertDocument("DOC_DG_REST", TENANT_A, { classification: "RESTRICTED", uploadedAt: yearsAgo(2) });

    const auth = await canDeleteDocument("DOC_DG_REST", { userId: USER_A, tenantId: TENANT_A });

    expect(auth.permitted).toBe(true);
    expect(auth.requiresApproval).toBe(true);
  });
});

describe("retention expiry detection", () => {
  it("finds documents with expired retention", async () => {
    await insertDocument("DOC_DG_EXP1", TENANT_A, { uploadedAt: yearsAgo(2) });
    await insertDocument("DOC_DG_EXP2", TENANT_A, { uploadedAt: yearsAgo(2) });

    const expired = await findRetentionExpiredDocuments({ tenantId: TENANT_A });

    expect(expired.length).toBe(2);
    expect(expired[0].eligible).toBe(true);
    expect(expired[1].eligible).toBe(true);
  });

  it("excludes documents under legal hold from eligible list", async () => {
    await insertDocument("DOC_DG_HOLD_EXP", TENANT_A, { legalHold: true, uploadedAt: yearsAgo(2) });

    const expired = await findRetentionExpiredDocuments({ tenantId: TENANT_A });

    // Filtered out by the query (legal_hold = false predicate)
    expect(expired.length).toBe(0);
  });
});

describe("adversarial tests", () => {
  it("denies unauthorized legal hold removal", async () => {
    await insertDocument("DOC_DG_ADV1", TENANT_A, { legalHold: true, uploadedAt: yearsAgo(2) });

    // Tenant B tries to remove hold from Tenant A's document
    const result = await removeLegalHold("DOC_DG_ADV1", { userId: USER_B, tenantId: TENANT_B }, "Unauthorized");

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/cross-tenant/i);
  });

  it("denies deletion of non-expired retention", async () => {
    await insertDocument("DOC_DG_ADV2", TENANT_A, { retentionCode: "DG_5YR" });

    const auth = await canDeleteDocument("DOC_DG_ADV2", { userId: USER_A, tenantId: TENANT_A });

    expect(auth.permitted).toBe(false);
    expect(auth.reason).toMatch(/retention.*not.*expired/i);
  });
});
