import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CreatePublicContentSchema,
  isSafePublicImageUrl,
  parsePublicFeedQuery,
  toPublicFeedItem,
} from "@/lib/public-content";
import { HIGH_RISK_PERMISSIONS } from "@/lib/constants";
import { RUNTIME_NO_DELETE_TABLES, RUNTIME_TABLE_ALLOWLIST } from "../../scripts/runtime-privilege-allowlist";

const migrationSql = readFileSync(new URL("../../drizzle/0083_public_content.sql", import.meta.url), "utf8");
const publicFeedRoute = readFileSync(new URL("../../src/app/api/public/content/route.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../../src/app/api/v1/public-content/route.ts", import.meta.url), "utf8");
const approvalRoute = readFileSync(new URL("../../src/app/api/v1/public-content/approval/route.ts", import.meta.url), "utf8");

describe("public content query parsing and sanitization", () => {
  it("parses valid defaults and bounded query parameters", () => {
    expect(parsePublicFeedQuery(new URLSearchParams())).toEqual({
      ok: true,
      limit: 6,
      offset: 0,
      kind: null,
      q: null,
    });
    expect(parsePublicFeedQuery(new URLSearchParams("limit=12&offset=6&kind=event&q=Healthcare"))).toEqual({
      ok: true,
      limit: 12,
      offset: 6,
      kind: "EVENT",
      q: "Healthcare",
    });
  });

  it("fails closed with 400 validation errors on invalid query parameters", () => {
    expect(parsePublicFeedQuery(new URLSearchParams("limit=0")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams("limit=999")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams("limit=abc")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams("offset=-1")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams("offset=500")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams("kind=INTERNAL")).ok).toBe(false);
    expect(parsePublicFeedQuery(new URLSearchParams(`q=${"a".repeat(101)}`)).ok).toBe(false);
  });

  it("sanitizes public image URLs to safe same-origin paths or https URLs only", () => {
    expect(isSafePublicImageUrl("/brand/beyu-os-logo.png")).toBe(true);
    expect(isSafePublicImageUrl("https://cdn.beyu.co.tz/news/banner.png")).toBe(true);
    expect(isSafePublicImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicImageUrl("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isSafePublicImageUrl("http://insecure.example/a.png")).toBe(false);
    expect(isSafePublicImageUrl("//evil.example/a.png")).toBe(false);
    expect(isSafePublicImageUrl("/brand/a.png\nInjected")).toBe(false);
  });

  it("validates public content creation payloads and rejects unsafe or reversed event inputs", () => {
    const valid = CreatePublicContentSchema.safeParse({
      kind: "EVENT",
      title: "BEYU Annual Governance Forum",
      slug: "beyu-annual-governance-forum",
      summary: "Institutional partners convene in Dar es Salaam.",
      body: "Official announcement covering BEYU institutional governance and sector updates.",
      imageUrl: "/brand/beyu-os-logo.png",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T17:00:00.000Z",
      classification: "PUBLIC",
    });
    expect(valid.success).toBe(true);

    const reversedDates = CreatePublicContentSchema.safeParse({
      kind: "EVENT",
      title: "BEYU Annual Governance Forum",
      slug: "beyu-annual-governance-forum",
      summary: "Institutional partners convene in Dar es Salaam.",
      body: "Official announcement covering BEYU institutional governance and sector updates.",
      startsAt: "2026-12-02T09:00:00.000Z",
      endsAt: "2026-12-01T09:00:00.000Z",
      classification: "PUBLIC",
    });
    expect(reversedDates.success).toBe(false);

    const unsafeImg = CreatePublicContentSchema.safeParse({
      kind: "NEWS",
      title: "BEYU Ecosystem Update",
      slug: "beyu-ecosystem-update",
      summary: "Institutional update on sector milestones.",
      body: "Full text of the institutional announcement approved for publication.",
      imageUrl: "javascript:alert(1)",
      classification: "PUBLIC",
    });
    expect(unsafeImg.success).toBe(false);
  });

  it("projects public feed rows without leaking internal database identifiers", () => {
    const projected = toPublicFeedItem({
      slug: "official-announcement",
      kind: "NEWS",
      title: "Official Announcement",
      summary: "Approved summary text.",
      imageUrl: "javascript:alert(1)",
      location: null,
      startsAt: null,
      endsAt: null,
      publishedAt: new Date("2026-11-20T08:00:00.000Z"),
      isFeatured: false,
    });
    expect(projected).toEqual({
      slug: "official-announcement",
      kind: "NEWS",
      title: "Official Announcement",
      summary: "Approved summary text.",
      imageUrl: null,
      location: null,
      startsAt: null,
      endsAt: null,
      publishedAt: "2026-11-20T08:00:00.000Z",
      isFeatured: false,
    });
    expect("id" in projected).toBe(false);
    expect("tenantId" in projected).toBe(false);
    expect("createdBy" in projected).toBe(false);
    expect("approvedBy" in projected).toBe(false);
  });
});

describe("public_content database, RLS, runtime allowlist and API governance", () => {
  it("enforces FORCE RLS, maker-checker CHECK constraint, and anonymous PUBLIC-only read policy in migration 0083", () => {
    expect(migrationSql).toContain('ALTER TABLE "public_content" ENABLE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('ALTER TABLE "public_content" FORCE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('CONSTRAINT "public_content_publish_governance_ck"');
    expect(migrationSql).toContain("approved_by IS NOT NULL AND approved_by <> created_by AND published_at IS NOT NULL");
    expect(migrationSql).toContain('CREATE POLICY "public_content_anonymous_published_read"');
    expect(migrationSql).toContain('"classification" = \'PUBLIC\' AND "status" = \'PUBLISHED\'');
    expect(migrationSql).toContain('CREATE POLICY "public_content_tenant_manage"');
  });

  it("registers public_content in runtime privilege allowlists without DELETE permission", () => {
    expect(RUNTIME_TABLE_ALLOWLIST).toContain("public_content");
    expect(RUNTIME_NO_DELETE_TABLES).toContain("public_content");
  });

  it("accepts NextRequest in /api/public/content GET, sets no-store, and never selects internal actor/tenant fields", () => {
    expect(publicFeedRoute).toContain("export async function GET(request: NextRequest)");
    expect(publicFeedRoute).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(publicFeedRoute).toContain('eq(publicContent.classification, "PUBLIC")');
    expect(publicFeedRoute).toContain('eq(publicContent.status, "PUBLISHED")');
    expect(publicFeedRoute).not.toContain("tenantId: publicContent.tenantId");
    expect(publicFeedRoute).not.toContain("createdBy: publicContent.createdBy");
    expect(publicFeedRoute).not.toContain("approvedBy: publicContent.approvedBy");
  });

  it("guards management and approval routes with tenant RLS context, MFA high-risk approval permission, SoD, and immutable audit", () => {
    expect(HIGH_RISK_PERMISSIONS.includes("communications:broadcast.approve")).toBe(true);
    expect(adminRoute).toContain('permission: "communications:broadcast.manage"');
    expect(adminRoute).toContain("withIdempotency(");
    expect(adminRoute).toContain("recordAudit(");
    expect(adminRoute).toContain("apiError(");
    expect(adminRoute).toContain("apiOk(");
    // PATCH must NOT opt out of guarded() tenant RLS context
    const patchSection = adminRoute.slice(adminRoute.indexOf("export async function PATCH"));
    expect(patchSection).not.toContain('databaseContext: "handler"');

    // Approval route must require high-risk approval permission, tenant RLS context, SoD, and audit
    expect(approvalRoute).toContain('permission: "communications:broadcast.approve"');
    expect(approvalRoute).not.toContain('databaseContext: "handler"');
    expect(approvalRoute).toContain("row.createdBy === ctx.principal.userId");
    expect(approvalRoute).toContain('"AUTHOR_CANNOT_APPROVE_OWN_CONTENT"');
    expect(approvalRoute).toContain("recordAudit(");
    expect(approvalRoute).toContain("apiError(");
    expect(approvalRoute).toContain("apiOk(");
  });
});
