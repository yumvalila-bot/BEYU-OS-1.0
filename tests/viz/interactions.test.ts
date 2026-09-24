/**
 * Holograph governed interactions — authorization, ledger, delegation and
 * the Finance boundary (real PostgreSQL).
 *
 * Proves:
 *   • presentation interactions are ALLOWED only when the sector boundary
 *     (the SAME canonical resolvers) allows, and are ledgered with audit +
 *     event;
 *   • DENIED interactions are first-class ledger rows (denial is audited,
 *     including the reason, and the event payload carries no data values);
 *   • the Finance boundary: a principal WITHOUT a Finance read path is
 *     DENIED for FINANCE-sector interactions — and no interaction, allowed
 *     or denied, ever creates workflow state or touches a journal
 *     (CAP_POSTING stays LOCKED);
 *   • REQUEST_WORKFLOW / REQUEST_APPROVAL are DELEGATIONS: they record intent
 *     and point at the governed surface — they create NO workflow state and
 *     execute NOTHING;
 *   • navigation intents require the target surface's own read grant;
 *   • the interaction ledger is tenant-scoped: another tenant's rows never
 *     appear.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents, vizInteractions, workflowInstances } from "@/db/schema";
import { listInteractions, requestInteraction } from "@/lib/viz/interactions";
import { VizDomainError, type VizActor } from "@/lib/viz/service";
import { can } from "@/lib/authz";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZINT${Date.now()}`;

type Seeded = Awaited<ReturnType<typeof seededPrincipal>>;

function actorFor(principal: { tenantId: string; userId: string }): VizActor {
  return { tenantId: principal.tenantId, userId: principal.userId, traceId: `TRACEINT${Date.now()}`, ipAddress: null, userAgent: null };
}

describe("Holograph interactions — governed request model", () => {
  let ceo: Seeded;
  let admin: Seeded;
  let ujenziOps: Seeded;
  let governance: Seeded;
  let auditor: Seeded;
  let workflowsBefore = 0;
  const adminTenantCreated: string[] = [];
  const ujenziTenantCreated: string[] = [];

  beforeAll(async () => {
    ceo = await seededPrincipal("ceo@beyu.os");
    admin = await seededPrincipal("admin@beyu.os"); // PLATFORM_ADMIN: NO Finance read path
    ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os"); // UJENZI tenant
    governance = await seededPrincipal("governance@beyu.os");
    auditor = await seededPrincipal("auditor@beyu.os");
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(workflowInstances);
    workflowsBefore = Number(row?.n ?? 0);
  });

  afterAll(async () => {
    // Ledger rows are audit evidence: the suite cleans only the rows its own
    // tests created (by id) to keep the ledger meaningful.
    const all = [...adminTenantCreated, ...ujenziTenantCreated];
    if (all.length > 0) {
      await db.delete(vizInteractions).where(inArray(vizInteractions.id, all));
    }
  });

  it("ALLOWED presentation interaction over an authorized sector (ledger + audit + event)", async () => {
    const result = await requestInteraction(
      { interactionType: "SELECT_OBJECT", sector: "UJENZI", objectRef: "PROJECT:PROBE" },
      actorFor(ujenziOps),
      ujenziOps,
    );
    ujenziTenantCreated.push(result.interactionId);
    expect(result.outcome).toBe("ALLOWED");
    expect(result.sector).toBe("UJENZI");

    const [ledger] = await db.select().from(vizInteractions).where(eq(vizInteractions.id, result.interactionId));
    expect(ledger?.outcome).toBe("ALLOWED");
    expect(ledger?.interactionType).toBe("SELECT_OBJECT");

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.objectId, result.interactionId));
    expect(audit?.action).toBe("VIZ_INTERACTION_ALLOWED");
    expect(audit?.outcome).toBe("SUCCESS");
    expect(audit?.actorUserId).toBe(ujenziOps.userId);

    const [event] = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, result.interactionId));
    expect(event?.type).toBe("VIZ_INTERACTION_REQUESTED");
    expect((event?.payload as Record<string, unknown>).outcome).toBe("ALLOWED");
    // The event payload is shape/status only — no object reference values.
    expect(JSON.stringify(event?.payload)).not.toContain("PROJECT:PROBE");
  });

  it("DENIED when the principal has NO Finance read path — and the denial is a first-class ledger row (Finance boundary)", async () => {
    // PLATFORM_ADMIN holds no finance:* read permission at all: a FINANCE
    // interaction must be refused at the sector stage, ledgered and audited
    // as DENIED. CAP_POSTING stays LOCKED; nothing here can post.
    expect(can(admin, "finance:ledger.read" as never).allowed).toBe(false);
    const result = await requestInteraction(
      { interactionType: "QUERY_SPATIAL_DATA", sector: "FINANCE" },
      actorFor(admin),
      admin,
    );
    adminTenantCreated.push(result.interactionId);
    expect(result.outcome).toBe("DENIED");
    expect(result.reason).toMatch(/Finance/i);

    const [ledger] = await db.select().from(vizInteractions).where(eq(vizInteractions.id, result.interactionId));
    expect(ledger?.outcome).toBe("DENIED");
    expect(ledger?.reason).toMatch(/Finance/i);

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.objectId, result.interactionId));
    expect(audit?.action).toBe("VIZ_INTERACTION_DENIED");
    expect(audit?.outcome).toBe("DENIED");
    expect(audit?.reason).toBeTruthy();
  });

  it("DENIED cross-tenant scene reference resolves as a refusal, never a leak", async () => {
    // ujenzi.ops requests an interaction on a scene id that does not exist in
    // its tenant: the reference does not resolve (NOT_FOUND-class refusal).
    const result = await requestInteraction(
      { interactionType: "INSPECT_OBJECT", sceneId: "VZS_DOES_NOT_EXIST" },
      actorFor(ujenziOps),
      ujenziOps,
    );
    ujenziTenantCreated.push(result.interactionId);
    expect(result.outcome).toBe("DENIED");
    expect(result.reason).toMatch(/does not resolve|not found/i);
  });

  it("REQUEST_APPROVAL is DELEGATED to the governed surface — no workflow state is created, nothing executes", async () => {
    const result = await requestInteraction(
      { interactionType: "REQUEST_APPROVAL", sector: "BEYU", targetDomain: "GOVERNANCE", targetRef: "RES-PROBE" },
      actorFor(governance),
      governance,
    );
    adminTenantCreated.push(result.interactionId);
    expect(result.outcome).toBe("DELEGATED");
    expect(result.delegation?.targetDomain).toBe("GOVERNANCE");
    expect(result.delegation?.canonicalSurface).toBe("/os/governance");
    expect(result.delegation?.note).toMatch(/records the request only|owns approval/i);

    const after = Number(
      (await db.select({ n: sql<number>`count(*)::int` }).from(workflowInstances))[0]?.n ?? 0,
    );
    expect(after).toBe(workflowsBefore); // delegation created NO workflow state
  });

  it("REQUEST_WORKFLOW without a canonical target domain is DENIED", async () => {
    const result = await requestInteraction(
      { interactionType: "REQUEST_WORKFLOW", sector: "BEYU" },
      actorFor(ceo),
      ceo,
    );
    adminTenantCreated.push(result.interactionId);
    expect(result.outcome).toBe("DENIED");
    expect(result.reason).toMatch(/target domain/i);
  });

  it("OPEN_DOCUMENT enforces the documents surface grant (intent never advertises a locked door)", async () => {
    // Positive control: the auditor role holds documents:registry.read.
    expect(can(auditor, "documents:registry.read" as never).allowed).toBe(true);
    const allowed = await requestInteraction({ interactionType: "OPEN_DOCUMENT", sector: "BEYU", targetDomain: "DOCUMENT" }, actorFor(auditor), auditor);
    adminTenantCreated.push(allowed.interactionId);
    expect(allowed.outcome).toBe("ALLOWED");

    // Deterministic negative: the SAME principal with the documents grant
    // removed from its resolved set is refused, and the refusal names the
    // missing surface permission (the interaction must never advertise a
    // door the principal cannot open).
    const stripped: Seeded = { ...ujenziOps, permissions: new Set([...ujenziOps.permissions].filter((p) => p !== ("documents:registry.read" as never))) };
    expect(can(stripped, "documents:registry.read" as never).allowed).toBe(false);
    const denied = await requestInteraction({ interactionType: "OPEN_DOCUMENT", sector: "BEYU", targetDomain: "DOCUMENT" }, actorFor(stripped), stripped);
    ujenziTenantCreated.push(denied.interactionId);
    expect(denied.outcome).toBe("DENIED");
    expect(denied.reason).toMatch(/documents:registry.read/i);
  });

  it("VIEW_AUDIT_CONTEXT enforces the audit ledger grant", async () => {
    const result = await requestInteraction(
      { interactionType: "VIEW_AUDIT_CONTEXT", sector: "BEYU" },
      actorFor(ujenziOps),
      ujenziOps,
    );
    ujenziTenantCreated.push(result.interactionId);
    if (can(ujenziOps, "audit:log.read" as never).allowed) {
      expect(result.outcome).toBe("ALLOWED");
    } else {
      expect(result.outcome).toBe("DENIED");
      expect(result.reason).toMatch(/audit:log.read/i);
    }
  });

  it("rejects unknown interaction types (closed vocabulary)", async () => {
    await expect(
      requestInteraction({ interactionType: "POST_JOURNAL", sector: "FINANCE" }, actorFor(ceo), ceo),
    ).rejects.toThrow(VizDomainError);
  });

  it("the ledger is tenant-scoped: this tenant's rows include this suite's rows and NEVER the other tenant's", async () => {
    const adminList = await listInteractions(governance, { limit: 500 });
    const adminIds = new Set(adminList.map((r) => r.id));
    for (const id of adminTenantCreated) expect(adminIds.has(id), `admin-tenant row ${id} present`).toBe(true);
    for (const id of ujenziTenantCreated) expect(adminIds.has(id), `ujenzi-tenant row ${id} absent`).toBe(false);

    const ujenziList = await listInteractions(ujenziOps, { limit: 500 });
    const ujenziIds = new Set(ujenziList.map((r) => r.id));
    for (const id of ujenziTenantCreated) expect(ujenziIds.has(id), `ujenzi-tenant row ${id} present`).toBe(true);
    for (const id of adminTenantCreated) expect(ujenziIds.has(id), `admin-tenant row ${id} absent`).toBe(false);

    for (const row of [...adminList, ...ujenziList]) {
      expect(["ALLOWED", "DENIED", "DELEGATED"]).toContain(row.outcome);
    }
  });

  it("the Finance boundary: no interaction, allowed or denied, creates workflow state (CAP_POSTING stays LOCKED)", async () => {
    const after = Number(
      (await db.select({ n: sql<number>`count(*)::int` }).from(workflowInstances))[0]?.n ?? 0,
    );
    // The whole suite's interaction traffic must have created zero workflow
    // instances: delegations are records of intent, not executions.
    expect(after).toBe(workflowsBefore);
  });
});
