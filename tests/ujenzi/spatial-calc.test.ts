import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";
import { runSimpleUdlBeamMoment } from "@/lib/ujenzi/calculations";
import { isKnownCrs, validateLonLat } from "@/lib/ujenzi/crs";
import {
  createLandSite,
  createProject,
  ingestGeoJsonDataset,
  recordSurveyObservation,
  UjenziDomainError,
} from "@/lib/ujenzi";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("Ujenzi calculation family SIMPLE_UDL_BEAM_MOMENT", () => {
  it("computes M = wL^2/8 in N.m and stays NOT_CERTIFIED", () => {
    const run = runSimpleUdlBeamMoment({ w: 10, L: 6, wUnit: "kN/m", LUnit: "m" });
    expect(run.result.M_max_Nm).toBeCloseTo(45000, 6);
    expect(run.professionalCertification).toBe("NOT_CERTIFIED");
  });

  it("rejects incompatible units", () => {
    expect(() => runSimpleUdlBeamMoment({ w: 10, L: 6, wUnit: "kg", LUnit: "m" })).toThrow(/INCOMPATIBLE_UNIT/);
  });

  it("rejects non-positive span", () => {
    expect(() => runSimpleUdlBeamMoment({ w: 10, L: 0, wUnit: "N/m", LUnit: "m" })).toThrow(/INVALID_INPUT/);
  });
});

describe("Ujenzi CRS", () => {
  it("knows EPSG:4326 and Arc 1960 UTM 37S", () => {
    expect(isKnownCrs("EPSG:4326")).toBe(true);
    expect(isKnownCrs("EPSG:21037")).toBe(true);
    expect(isKnownCrs("EPSG:99999")).toBe(false);
  });

  it("validates lon/lat", () => {
    expect(validateLonLat(39.2, -6.8)).toBe(true);
    expect(validateLonLat(200, 0)).toBe(false);
  });
});

describe("Ujenzi survey and GIS ingest", () => {
  it("survey without coordinates is DATA_REQUIRED; GeoJSON FeatureCollection ingests", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `SP${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "Spatial",
      countryCode: "TZ",
    });
    const site = await createLandSite({ tenantId: ops.tenantId, projectId: project.id, code: `${code}S`, name: "S", crs: "EPSG:4326" });
    const missing = await recordSurveyObservation({
      tenantId: ops.tenantId,
      siteId: site.id,
      method: "GNSS",
      crs: "EPSG:4326",
    });
    expect(missing.dataStatus).toBe("DATA_REQUIRED");
    const ok = await recordSurveyObservation({
      tenantId: ops.tenantId,
      siteId: site.id,
      method: "GNSS",
      crs: "EPSG:4326",
      eastingOrLon: 39.2,
      northingOrLat: -6.8,
    });
    expect(ok.dataStatus).toBe("RECORDED");
    await expect(
      recordSurveyObservation({ tenantId: ops.tenantId, siteId: site.id, method: "GNSS", crs: "EPSG:0000" }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    const gis = await ingestGeoJsonDataset({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}G`,
      title: "Parcels",
      source: "USER_ENTERED",
      crs: "EPSG:4326",
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [39.2, -6.8] } }] },
    });
    expect(gis.ingestStatus).toBe("INGESTED");
    expect(gis.featureCount).toBe(1);
    expect(gis.renderer).toBe("NOT_IMPLEMENTED");
    await expect(
      ingestGeoJsonDataset({
        tenantId: ops.tenantId,
        code: `${code}X`,
        title: "bad",
        source: "x",
        crs: "EPSG:4326",
        geojson: { type: "NotACollection" },
      }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
  });
});
