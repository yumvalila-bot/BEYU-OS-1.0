/**
 * VISUALIZATION FOUNDATION — HTTP transport (end-to-end over guarded()).
 *
 * skipIf during collection: HTTP suites require the running server.
 * Pattern matches tests/ujenzi/http.test.ts / tests/agriculture/http.test.ts.
 *
 * Proves the real governed boundary end to end: session auth → RBAC →
 * classification ceiling → tenant/entity scope → RLS → service → canonical
 * error envelope, plus the export attachment contract (hash + ledger).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiGetJson, apiPost, isDeniedPage, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let adminCookie = "";
let ceoCookie = "";
let governanceCookie = "";
let opsCookie = ""; // ujenzi.ops — SECTOR_OPERATOR (BEYU-UJENZI tenant)
let hcmCookie = ""; // viz:registry.read + viz:scene.read; NO manage/export
let familyCookie = ""; // FAMILY_MEMBER_VIEW — no viz permissions at all

const RUN = `VIZHTTP${Date.now()}`;

type RegistryBody = {
  dimensions?: { id?: string }[];
  canonicalCount?: number;
  extensionCount?: number;
  sectors?: string[];
  adapters?: { sector?: string; status?: string }[];
};
type ManifestBody = {
  manifest?: {
    sector?: string;
    objects?: Record<string, unknown>[];
    accessibleTable?: { columns?: string[]; rows?: string[][] };
    withheldByClassification?: number;
    provenance?: { sourceAdapter?: string; systemOfRecord?: string; epistemicStatus?: string };
  };
};
type SceneBody = { scene?: { id?: string; status?: string; tenantId?: string } };
type TwinRegistrationBody = { twin?: { id?: string; twinKey?: string } };
type TwinProjectionBody = {
  twin?: {
    identity?: { twinKey?: string; sector?: string; subjectId?: string };
    state?: { code?: string }[];
    provenance?: { sourceAdapter?: string };
  };
};
type ErrorBody = { error?: { code?: string } };

beforeAll(async () => {
  if (!available) return;
  adminCookie = await login("admin@beyu.os");
  ceoCookie = await login("ceo@beyu.os");
  governanceCookie = await login("governance@beyu.os");
  opsCookie = await login("ujenzi.ops@beyu.os");
  hcmCookie = await login("hcm@beyu.os");
  familyCookie = await login("family@beyu.os");
}, 240_000);

describe.skipIf(!available)("Visualization API over HTTP", () => {
  it("unauthenticated GET registry is 401", async () => {
    const res = await apiGetJson("/api/v1/viz/registry");
    expect(res.status).toBe(401);
  });

  it("unauthenticated POST scenes is 401", async () => {
    const res = await apiPost("/api/v1/viz/scenes", { name: "x", sector: "BEYU", dimensions: ["1D"] });
    expect(res.status).toBe(401);
  });

  it("family member (no viz permissions) is 403 on the registry", async () => {
    const res = await apiGetJson<ErrorBody>("/api/v1/viz/registry", { cookie: familyCookie });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("HCM director reads the registry but cannot manage scenes", async () => {
    const registry = await apiGetJson<RegistryBody>("/api/v1/viz/registry", { cookie: hcmCookie });
    expect(registry.status).toBe(200);
    expect((registry.body.dimensions ?? []).length).toBeGreaterThanOrEqual(9);

    const create = await apiPost<ErrorBody>(
      "/api/v1/viz/scenes",
      { name: `${RUN} hcm`, sector: "UJENZI", dimensions: ["1D"] },
      { cookie: hcmCookie },
    );
    expect(create.status).toBe(403);
    expect(create.body.error?.code).toBe("FORBIDDEN");
  });

  it("registry exposes the full dimension ladder and every sector adapter", async () => {
    const res = await apiGetJson<RegistryBody>("/api/v1/viz/registry", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const codes = (res.body.dimensions ?? []).map((d) => d.id);
    // Canonical ladder 1D–8D + XD is built in; 9D+ exist only as governed
    // extensions registered through the HIGH-RISK viz:dimension.manage path
    // (MFA step-up) and are merged in here when present.
    for (const required of ["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "XD"]) {
      expect(codes).toContain(required);
    }
    expect(res.body.canonicalCount).toBe(9);
    expect(typeof res.body.extensionCount).toBe("number");
    expect((res.body.extensionCount ?? 0) + 9).toBe(codes.length);
    expect(res.body.sectors?.sort()).toEqual(
      ["AGRICULTURE", "BEYU", "FINANCE", "FOUNDATION", "HEALTH", "UJENZI"].sort(),
    );
    const adapters = res.body.adapters ?? [];
    expect(adapters.map((a) => a.sector).sort()).toEqual(
      ["AGRICULTURE", "BEYU", "FINANCE", "FOUNDATION", "HEALTH", "UJENZI"].sort(),
    );
    // Honest per-adapter status (§45): the sector adapters are IMPLEMENTED;
    // the HEALTH federation and the BEYU control-plane adapter are honestly
    // PARTIALLY_IMPLEMENTED — declared, never hidden.
    const statusBySector = Object.fromEntries(adapters.map((a) => [a.sector, a.status]));
    for (const sector of ["AGRICULTURE", "FINANCE", "FOUNDATION", "UJENZI"]) {
      expect(statusBySector[sector]).toBe("IMPLEMENTED");
    }
    expect(statusBySector.HEALTH).toBe("PARTIALLY_IMPLEMENTED");
    expect(statusBySector.BEYU).toBe("PARTIALLY_IMPLEMENTED");
  });

  it("manifest validates sectors and dimensions fail-closed (422, never 500)", async () => {
    const badSector = await apiGetJson<ErrorBody>("/api/v1/viz/manifest?sector=MARS", { cookie: adminCookie });
    expect(badSector.status).toBe(422);
    expect(badSector.body.error?.code).toBe("VALIDATION_FAILED");

    const badDim = await apiGetJson<ErrorBody>(
      `/api/v1/viz/manifest?sector=BEYU&dimensions=${encodeURIComponent("1D,99999X")}`,
      { cookie: adminCookie },
    );
    expect(badDim.status).toBe(422);
    expect(badDim.body.error?.code).toBe("VALIDATION_FAILED");
  });

  it("Ujenzi operator gets a governed UJENZI manifest; FOUNDATION reads are honestly empty", async () => {
    const own = await apiGetJson<ManifestBody>("/api/v1/viz/manifest?sector=UJENZI", { cookie: opsCookie });
    expect(own.status).toBe(200);
    expect(own.body.manifest?.sector).toBe("UJENZI");
    expect(Array.isArray(own.body.manifest?.objects)).toBe(true);
    expect(own.body.manifest?.provenance?.sourceAdapter).toBe("UJENZI");
    // The accessible table equivalent is ALWAYS present (§26).
    expect(Array.isArray(own.body.manifest?.accessibleTable?.columns)).toBe(true);

    // The Foundation adapter answers a non-Foundation principal with an honest
    // EMPTY dataset — no leak, no exception, no 500.
    const foundation = await apiGetJson<ManifestBody>("/api/v1/viz/manifest?sector=FOUNDATION", { cookie: opsCookie });
    expect(foundation.status).toBe(200);
    expect((foundation.body.manifest?.objects ?? []).length).toBe(0);
    expect(foundation.body.manifest?.provenance?.sourceAdapter).toBe("FOUNDATION");
  });

  it("scene lifecycle over HTTP: create → list → manifest → archive; cross-tenant is 404", async () => {
    const create = await apiPost<SceneBody>(
      "/api/v1/viz/scenes",
      { name: `${RUN} site`, sector: "UJENZI", dimensions: ["1D", "2D", "3D"] },
      { cookie: opsCookie },
    );
    expect(create.status).toBe(201);
    const sceneId = create.body.scene?.id ?? "";
    expect(sceneId).toMatch(/^VZS_/);
    expect(create.body.scene?.status).toBe("ACTIVE");

    const list = await apiGetJson<{ scenes?: { id?: string }[] }>("/api/v1/viz/scenes", { cookie: opsCookie });
    expect(list.status).toBe(200);
    expect((list.body.scenes ?? []).some((s) => s.id === sceneId)).toBe(true);

    const manifest = await apiGetJson<ManifestBody & { manifest?: { sceneId?: string } }>(
      `/api/v1/viz/scenes/${sceneId}`,
      { cookie: opsCookie },
    );
    expect(manifest.status).toBe(200);
    expect(manifest.body.manifest?.sector).toBe("UJENZI");

    // A different tenant's principal cannot even see the scene: 404 NOT_FOUND —
    // the id is a reference, never a grant (§21).
    const crossTenant = await apiGetJson<ErrorBody>(`/api/v1/viz/scenes/${sceneId}`, { cookie: ceoCookie });
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.error?.code).toBe("NOT_FOUND");

    const archive = await apiPost<SceneBody>(`/api/v1/viz/scenes/${sceneId}`, {}, { cookie: opsCookie });
    expect(archive.status).toBe(200);
    expect(archive.body.scene?.status).toBe("ARCHIVED");
  });

  it("twin registration and projection over HTTP", async () => {
    const subjectId = `${RUN}-SUBJECT`;
    const create = await apiPost<TwinRegistrationBody>(
      "/api/v1/viz/twins",
      { sector: "UJENZI", subjectType: "PROJECT", subjectId, name: `${RUN} twin` },
      { cookie: opsCookie },
    );
    expect(create.status).toBe(201);
    const twinId = create.body.twin?.id ?? "";
    expect(twinId).toMatch(/^VZT_/);
    expect(create.body.twin?.twinKey).toContain(subjectId);

    const projection = await apiGetJson<TwinProjectionBody>(`/api/v1/viz/twins/${twinId}`, { cookie: opsCookie });
    expect(projection.status).toBe(200);
    expect(projection.body.twin?.identity?.subjectId).toBe(subjectId);
    expect(Array.isArray(projection.body.twin?.state)).toBe(true);
    expect(projection.body.twin?.provenance?.sourceAdapter).toBe("UJENZI");

    const crossTenant = await apiGetJson<ErrorBody>(`/api/v1/viz/twins/${twinId}`, { cookie: ceoCookie });
    expect(crossTenant.status).toBe(404);
  });

  it("exports: viewing is not exporting; attachment bytes are hashed and ledgered", async () => {
    // Platform admin (viz:scene.manage) creates a BEYU scene in its own tenant.
    // GROUP_CEO deliberately holds NO scene.manage — executives view and export,
    // they do not configure scenes.
    const scene = await apiPost<SceneBody>(
      "/api/v1/viz/scenes",
      { name: `${RUN} exec`, sector: "BEYU", dimensions: ["1D", "5D"] },
      { cookie: adminCookie },
    );
    expect(scene.status).toBe(201);
    const sceneId = scene.body.scene?.id ?? "";

    // Governance can READ scenes but holds no viz:export → 403 at the boundary.
    const denied = await apiPost<ErrorBody>(
      "/api/v1/viz/exports",
      { sceneId, sector: "BEYU", format: "JSON" },
      { cookie: governanceCookie },
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("FORBIDDEN");

    // Admin holds viz:export → attachment + sha256 of the exact bytes + ledger row.
    const attachment = await apiPost(
      "/api/v1/viz/exports",
      { sceneId, sector: "BEYU", format: "JSON" },
      { cookie: adminCookie },
    );
    expect(attachment.status).toBe(201);
    expect(attachment.headers.get("content-disposition")).toContain("attachment");
    expect(attachment.headers.get("content-type")).toContain("application/json");
    const hash = attachment.headers.get("x-beyu-export-hash") ?? "";
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const ledger = await apiGetJson<{ exports?: { contentHash?: string; sceneId?: string }[] }>(
      "/api/v1/viz/exports",
      { cookie: adminCookie },
    );
    expect(ledger.status).toBe(200);
    expect((ledger.body.exports ?? []).some((e) => e.contentHash === hash && e.sceneId === sceneId)).toBe(true);
  });

  it("the shared /os/viz page renders for authorized principals and denies honestly otherwise", async () => {
    const authorized = await apiGet("/os/viz", adminCookie);
    expect(authorized.status).toBe(200);
    expect(isDeniedPage(authorized.html)).toBe(false);
    expect(authorized.html).toContain("Dimensional Graphics &amp; Digital Twins");

    // FAMILY_MEMBER_VIEW holds no viz permissions: the page renders the
    // governed denial panel — never a partial workspace, never a 500.
    const denied = await apiGet("/os/viz", familyCookie);
    expect(denied.status).toBe(200);
    expect(isDeniedPage(denied.html)).toBe(true);
  });

  it("never answers governed refusals with 500 (transport-level fail-closed)", async () => {
    // Unknown scene id → 404; malformed body → 422; no permission → 403.
    const missing = await apiGetJson<ErrorBody>("/api/v1/viz/scenes/VZS_MISSING", { cookie: opsCookie });
    expect(missing.status).toBe(404);
    expect(missing.body.error?.code).toBe("NOT_FOUND");

    const malformed = await apiPost<ErrorBody>("/api/v1/viz/scenes", { sector: 42 }, { cookie: opsCookie });
    expect(malformed.status).toBe(422);
    expect(malformed.body.error?.code).toBe("VALIDATION_FAILED");

    const noPermission = await apiGetJson<ErrorBody>("/api/v1/viz/exports", { cookie: hcmCookie });
    expect(noPermission.status).toBe(403);
  });
});
