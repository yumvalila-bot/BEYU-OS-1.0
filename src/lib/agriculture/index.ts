/**
 * BEYU Agriculture OS — sector operational domain.
 *
 * Owns farms, land, crops, livestock, aqua, inventory, work, observations,
 * weather, processing, traceability, marketplace, projects, hazards, permits
 * and offline sync. Does NOT own identity, HCM, journals, treasury, capital
 * execution or Noelia identity.
 *
 * Finance OS remains the only journal writer. CAP_POSTING stays LOCKED.
 * Harvest recording emits HARVEST_RECORDED; it never posts a journal.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import type { Classification } from "@/lib/constants";
import { AgriDomainError } from "./errors";

export { AgriDomainError } from "./errors";

export type AgriActor = {
  tenantId: string;
  userId: string;
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function agriId(): string {
  return newId(ID_PREFIX.agri);
}

const AGRICULTURE_SECTOR_CODE = "AGRICULTURE";

function assertActorTenant(actor: AgriActor | undefined, tenantId: string) {
  if (actor && actor.tenantId !== tenantId) {
    throw new AgriDomainError("SCOPE", "Agriculture actor tenant does not match the record tenant");
  }
}

async function assertAgricultureLegalEntity(tenantId: string, legalEntityId: string, countryCode?: string) {
  const [entity] = await db
    .select({
      id: s.legalEntities.id,
      tenantId: s.legalEntities.tenantId,
      sectorCode: s.legalEntities.sectorCode,
      countryCode: s.legalEntities.countryCode,
    })
    .from(s.legalEntities)
    .where(eq(s.legalEntities.id, legalEntityId))
    .limit(1);
  if (!entity) throw new AgriDomainError("NOT_FOUND", "Legal entity not found");
  if (entity.tenantId !== tenantId) {
    throw new AgriDomainError("SCOPE", "Legal entity is outside the principal tenant");
  }
  if (entity.sectorCode !== AGRICULTURE_SECTOR_CODE) {
    throw new AgriDomainError("SCOPE", "Agriculture OS writes require an agriculture legal entity");
  }
  if (countryCode && entity.countryCode && countryCode !== entity.countryCode) {
    throw new AgriDomainError("SCOPE", "Country is outside the legal entity jurisdiction");
  }
}

function auditBase(actor: AgriActor, action: string, objectType: string, objectId: string, newValue: Record<string, unknown>) {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN" as const,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS" as const,
    authority: "agriculture:data.manage",
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

export interface CreateFarmInput {
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  countryCode: string;
  region?: string;
  totalAreaHa?: string;
  arableAreaHa?: string;
  soilType?: string;
  waterSource?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
  timezone?: string;
  classification?: string;
  notes?: string;
}

export interface CreateFieldInput {
  tenantId: string;
  farmId: string;
  code: string;
  name: string;
  areaHa: string;
  soilType?: string;
  irrigationType?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
}

export interface CreateCropCycleInput {
  tenantId: string;
  fieldId: string;
  cropTypeId?: string;
  cropType?: string;
  code: string;
  season: string;
  plantingDate: string;
  expectedHarvestDate?: string;
  seedQuantityKg?: string;
  expectedYieldKg?: string;
  variety?: string;
}

export interface RecordHarvestInput {
  tenantId: string;
  cropCycleId: string;
  code: string;
  harvestDate: string;
  quantityKg: string;
  qualityGrade?: string;
  moistureContent?: string;
  harvestedBy?: string;
  storageLocation?: string;
  notes?: string;
  unit?: string;
  batchCode?: string;
}

export interface RecordLivestockEventInput {
  tenantId: string;
  herdId: string;
  eventType: "BIRTH" | "DEATH" | "PURCHASE" | "SALE" | "VACCINATION" | "TREATMENT" | "TRANSFER";
  eventDate: string;
  headCount: number;
  description?: string;
  performedBy?: string;
  cost?: string;
  notes?: string;
}

export interface CreateHerdInput {
  tenantId: string;
  farmId: string;
  livestockTypeId?: string;
  species?: string;
  breed?: string;
  code: string;
  name: string;
  headCount?: number;
  location?: string;
}

async function resolveCropTypeId(tenantId: string, cropTypeId?: string, cropType?: string): Promise<string> {
  if (cropTypeId) {
    const [row] = await db
      .select({ id: s.cropTypes.id })
      .from(s.cropTypes)
      .where(and(eq(s.cropTypes.id, cropTypeId), eq(s.cropTypes.tenantId, tenantId)))
      .limit(1);
    if (row) return row.id;
    const [byCode] = await db
      .select({ id: s.cropTypes.id })
      .from(s.cropTypes)
      .where(and(eq(s.cropTypes.code, cropTypeId), eq(s.cropTypes.tenantId, tenantId)))
      .limit(1);
    if (byCode) return byCode.id;
  }
  const code = (cropType ?? cropTypeId ?? "").trim().toUpperCase();
  if (!code) throw new AgriDomainError("INVALID_STATE", "cropTypeId or cropType is required");
  const [existing] = await db
    .select({ id: s.cropTypes.id })
    .from(s.cropTypes)
    .where(and(eq(s.cropTypes.tenantId, tenantId), eq(s.cropTypes.code, code)))
    .limit(1);
  if (existing) return existing.id;
  const id = agriId();
  await db.insert(s.cropTypes).values({
    id,
    tenantId,
    code,
    name: code,
    category: "CROP",
    unitOfMeasure: "KG",
  });
  return id;
}

async function resolveLivestockTypeId(tenantId: string, livestockTypeId?: string, species?: string, breed?: string): Promise<string> {
  if (livestockTypeId) {
    const [row] = await db
      .select({ id: s.livestockTypes.id })
      .from(s.livestockTypes)
      .where(and(eq(s.livestockTypes.id, livestockTypeId), eq(s.livestockTypes.tenantId, tenantId)))
      .limit(1);
    if (row) return row.id;
  }
  const code = (species ?? "UNSPECIFIED").trim().toUpperCase();
  const [existing] = await db
    .select({ id: s.livestockTypes.id })
    .from(s.livestockTypes)
    .where(and(eq(s.livestockTypes.tenantId, tenantId), eq(s.livestockTypes.code, code)))
    .limit(1);
  if (existing) return existing.id;
  const id = agriId();
  await db.insert(s.livestockTypes).values({
    id,
    tenantId,
    code,
    name: species ?? code,
    species: species ?? code,
    breed: breed ?? null,
    purpose: "MIXED",
  });
  return id;
}

export async function createFarm(input: CreateFarmInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  await assertAgricultureLegalEntity(input.tenantId, input.legalEntityId, input.countryCode);
  const id = agriId();
  const values = {
    id,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    code: input.code,
    name: input.name,
    countryCode: input.countryCode,
    region: input.region,
    totalAreaHa: input.totalAreaHa,
    arableAreaHa: input.arableAreaHa,
    soilType: input.soilType,
    waterSource: input.waterSource,
    gpsLatitude: input.gpsLatitude,
    gpsLongitude: input.gpsLongitude,
    timezone: input.timezone ?? "Africa/Dar_es_Salaam",
    classification: input.classification ?? "INTERNAL",
    notes: input.notes,
    status: "ACTIVE",
  };
  const write = async () => {
    await db.insert(s.farms).values(values);
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "agriculture.farms.create", "AGRICULTURE_FARM", id, { code: input.code, name: input.name }));
}

export async function getFarm(farmId: string, tenantId: string) {
  const [farm] = await db.select().from(s.farms).where(and(eq(s.farms.id, farmId), eq(s.farms.tenantId, tenantId)));
  return farm ?? null;
}

export async function listFarms(tenantId: string) {
  return db.select().from(s.farms).where(eq(s.farms.tenantId, tenantId));
}

export async function createField(input: CreateFieldInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  const farm = await getFarm(input.farmId, input.tenantId);
  if (!farm) throw new AgriDomainError("NOT_FOUND", "Farm not found");
  const id = agriId();
  const write = async () => {
    await db.insert(s.fields).values({
      id,
      tenantId: input.tenantId,
      farmId: input.farmId,
      code: input.code,
      name: input.name,
      areaHa: input.areaHa,
      soilType: input.soilType,
      irrigationType: input.irrigationType,
      gpsLatitude: input.gpsLatitude,
      gpsLongitude: input.gpsLongitude,
      status: "ACTIVE",
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "agriculture.fields.create", "AGRICULTURE_FIELD", id, { code: input.code }));
}

export async function listFields(tenantId: string, farmId?: string) {
  const conditions = [eq(s.fields.tenantId, tenantId)];
  if (farmId) conditions.push(eq(s.fields.farmId, farmId));
  return db.select().from(s.fields).where(and(...conditions));
}

export async function createCropCycle(input: CreateCropCycleInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  const [field] = await db
    .select({ id: s.fields.id })
    .from(s.fields)
    .where(and(eq(s.fields.id, input.fieldId), eq(s.fields.tenantId, input.tenantId)))
    .limit(1);
  if (!field) throw new AgriDomainError("NOT_FOUND", "Field not found");
  const cropTypeId = await resolveCropTypeId(input.tenantId, input.cropTypeId, input.cropType);
  const id = agriId();
  const write = async () => {
    await db.insert(s.cropCycles).values({
      id,
      tenantId: input.tenantId,
      fieldId: input.fieldId,
      cropTypeId,
      code: input.code,
      season: input.season,
      plantingDate: input.plantingDate,
      expectedHarvestDate: input.expectedHarvestDate,
      seedQuantityKg: input.seedQuantityKg,
      expectedYieldKg: input.expectedYieldKg,
      variety: input.variety,
      status: "PLANTED",
    });
    return { id, cropTypeId };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "agriculture.cropCycles.create", "AGRICULTURE_CROP_CYCLE", id, { code: input.code, cropTypeId }));
}

export async function getCropCycle(cycleId: string, tenantId: string) {
  const [cycle] = await db
    .select()
    .from(s.cropCycles)
    .where(and(eq(s.cropCycles.id, cycleId), eq(s.cropCycles.tenantId, tenantId)));
  return cycle ?? null;
}

export async function listCropCycles(tenantId: string, status?: string) {
  const conditions = [eq(s.cropCycles.tenantId, tenantId)];
  if (status) conditions.push(eq(s.cropCycles.status, status));
  return db.select().from(s.cropCycles).where(and(...conditions));
}

export async function listHarvests(tenantId: string, cropCycleId?: string) {
  const conditions = [eq(s.harvests.tenantId, tenantId)];
  if (cropCycleId) conditions.push(eq(s.harvests.cropCycleId, cropCycleId));
  return db.select().from(s.harvests).where(and(...conditions));
}

export async function recordHarvest(input: RecordHarvestInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  const cycle = await getCropCycle(input.cropCycleId, input.tenantId);
  if (!cycle) throw new AgriDomainError("NOT_FOUND", "Crop cycle not found");

  const [field] = await db.select().from(s.fields).where(eq(s.fields.id, cycle.fieldId)).limit(1);
  const farm = field ? await getFarm(field.farmId, input.tenantId) : null;
  const id = agriId();

  const write = async () => {
    await db.insert(s.harvests).values({
      id,
      tenantId: input.tenantId,
      cropCycleId: input.cropCycleId,
      code: input.code,
      harvestDate: input.harvestDate,
      quantityKg: input.quantityKg,
      qualityGrade: input.qualityGrade,
      moistureContent: input.moistureContent,
      harvestedBy: input.harvestedBy,
      storageLocation: input.storageLocation,
      notes: input.notes,
      unit: input.unit ?? "KG",
      batchCode: input.batchCode,
    });

    const [currentYield] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(quantity_kg AS NUMERIC)), 0)` })
      .from(s.harvests)
      .where(eq(s.harvests.cropCycleId, input.cropCycleId));

    await db
      .update(s.cropCycles)
      .set({
        actualYieldKg: currentYield.total,
        actualHarvestDate: input.harvestDate,
        status: "HARVESTING",
      })
      .where(eq(s.cropCycles.id, input.cropCycleId));

    const areaHa = field?.areaHa ? Number(field.areaHa) : null;
    const qty = Number(input.quantityKg);
    await db.insert(s.yieldRecords).values({
      id: agriId(),
      tenantId: input.tenantId,
      cropCycleId: input.cropCycleId,
      harvestId: id,
      period: input.harvestDate.slice(0, 7),
      qtyKg: input.quantityKg,
      areaHa: field?.areaHa ?? null,
      kgPerHa: areaHa && areaHa > 0 ? String(qty / areaHa) : null,
      basis: "DERIVED",
    });

    return { id, journalsPosted: false as const, financeHandoff: "NONE" as const };
  };

  const harvestEvent = (result: { id: string }): EventInput => ({
    type: "HARVEST_RECORDED",
    source: "beyu-os/agriculture",
    domain: "AGRICULTURE",
    operation: "RECORD_HARVEST",
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: farm?.legalEntityId ?? null,
    subjectType: "AGRICULTURE_HARVEST",
    subjectId: result.id,
    actorUserId: actor?.userId ?? null,
    actorType: actor ? "HUMAN" : "SERVICE",
    classification: "INTERNAL" as Classification,
    payload: {
      cropCycleId: input.cropCycleId,
      code: input.code,
      harvestDate: input.harvestDate,
      quantityKg: input.quantityKg,
      unit: input.unit ?? "KG",
      journalsPosted: false,
    },
    traceId: actor?.traceId ?? `TRACEAGR${Date.now()}`,
    correlationId: actor?.traceId ?? `TRACEAGR${Date.now()}`,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: "agriculture:data.manage",
      policyVersion: null,
    },
    policyVersion: null,
  });

  if (!actor) {
    const result = await write();
    return result;
  }
  return withAuditTransaction(
    write,
    (result) => auditBase(actor, "agriculture.harvests.record", "AGRICULTURE_HARVEST", result.id, {
      code: input.code,
      quantityKg: input.quantityKg,
      journalsPosted: false,
    }),
    harvestEvent,
  );
}

export async function createHerd(input: CreateHerdInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  const farm = await getFarm(input.farmId, input.tenantId);
  if (!farm) throw new AgriDomainError("NOT_FOUND", "Farm not found");
  const livestockTypeId = await resolveLivestockTypeId(input.tenantId, input.livestockTypeId, input.species, input.breed);
  const id = agriId();
  const write = async () => {
    await db.insert(s.livestockHerds).values({
      id,
      tenantId: input.tenantId,
      farmId: input.farmId,
      livestockTypeId,
      code: input.code,
      name: input.name,
      headCount: input.headCount ?? 0,
      location: input.location,
      status: "ACTIVE",
    });
    return { id, livestockTypeId };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "agriculture.livestock.create", "AGRICULTURE_LIVESTOCK_HERD", id, { code: input.code }));
}

export async function recordLivestockEvent(input: RecordLivestockEventInput, actor?: AgriActor) {
  assertActorTenant(actor, input.tenantId);
  const [herd] = await db
    .select()
    .from(s.livestockHerds)
    .where(and(eq(s.livestockHerds.id, input.herdId), eq(s.livestockHerds.tenantId, input.tenantId)));
  if (!herd) throw new AgriDomainError("NOT_FOUND", "Livestock herd not found");

  const id = agriId();
  const write = async () => {
    await db.insert(s.livestockEvents).values({
      id,
      tenantId: input.tenantId,
      herdId: input.herdId,
      eventType: input.eventType,
      eventDate: input.eventDate,
      headCount: input.headCount,
      description: input.description,
      performedBy: input.performedBy,
      cost: input.cost,
      notes: input.notes,
    });
    const newHeadCount = herd.headCount + input.headCount;
    if (newHeadCount < 0) throw new AgriDomainError("INVALID_STATE", "Cannot have negative head count");
    await db.update(s.livestockHerds).set({ headCount: newHeadCount }).where(eq(s.livestockHerds.id, input.herdId));
    return { id, newHeadCount };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "agriculture.livestock.events.record", "AGRICULTURE_LIVESTOCK_EVENT", result.id, {
      eventType: input.eventType,
      newHeadCount: result.newHeadCount,
    }),
  );
}

export async function getHerd(herdId: string, tenantId: string) {
  const [herd] = await db
    .select()
    .from(s.livestockHerds)
    .where(and(eq(s.livestockHerds.id, herdId), eq(s.livestockHerds.tenantId, tenantId)));
  return herd ?? null;
}

export async function listHerds(tenantId: string, farmId?: string) {
  const conditions = [eq(s.livestockHerds.tenantId, tenantId)];
  if (farmId) conditions.push(eq(s.livestockHerds.farmId, farmId));
  return db.select().from(s.livestockHerds).where(and(...conditions));
}

export async function listByTenant<T extends { tenantId: unknown }>(table: { tenantId: T["tenantId"] } & object, tenantId: string) {
  return db.select().from(table as never).where(eq((table as { tenantId: typeof s.farms.tenantId }).tenantId, tenantId));
}

function coerceAgriValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "string") continue;
    if (
      key.endsWith("At") ||
      key === "capturedAt" ||
      key === "sampledAt" ||
      key === "measuredAt" ||
      key === "observedAt" ||
      key === "startedAt" ||
      key === "endedAt" ||
      key === "movedAt" ||
      key === "clientOccurredAt"
    ) {
      out[key] = new Date(value);
    }
  }
  return out;
}

export async function insertAgriRow(
  table: unknown,
  values: Record<string, unknown>,
  actor: AgriActor,
  action: string,
  objectType: string,
) {
  if (typeof values.legalEntityId === "string") {
    await assertAgricultureLegalEntity(
      actor.tenantId,
      values.legalEntityId,
      typeof values.countryCode === "string" ? values.countryCode : undefined,
    );
  }
  const id = typeof values.id === "string" ? values.id : agriId();
  const row = coerceAgriValues({ ...values, id, tenantId: actor.tenantId });
  return withAuditTransaction(
    async () => {
      await db.insert(table as typeof s.farms).values(row as never);
      return { id };
    },
    () => auditBase(actor, action, objectType, id, row),
  );
}

export async function createCapitalCase(
  input: {
    tenantId: string;
    legalEntityId?: string;
    farmId?: string;
    code: string;
    title: string;
    amount: string;
    currency?: string;
    notes?: string;
  },
  actor?: AgriActor,
) {
  assertActorTenant(actor, input.tenantId);
  if (input.legalEntityId) {
    await assertAgricultureLegalEntity(input.tenantId, input.legalEntityId);
  }
  if (input.farmId) {
    const farm = await getFarm(input.farmId, input.tenantId);
    if (!farm) throw new AgriDomainError("NOT_FOUND", "Farm not found");
  }
  const id = agriId();
  const write = async () => {
    await db.insert(s.capitalCases).values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      farmId: input.farmId,
      code: input.code,
      title: input.title,
      amount: input.amount,
      currency: input.currency ?? "USD",
      status: "SUBMITTED",
      financeHandoff: "SUBMITTED_PENDING_FINANCE",
      requestedBy: actor?.userId,
      notes: input.notes,
    });
    return {
      id,
      financeHandoff: "SUBMITTED_PENDING_FINANCE" as const,
      journalsPosted: false as const,
      capPosting: "LOCKED" as const,
    };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "agriculture.capitalCases.submit", "AGRICULTURE_CAPITAL_CASE", result.id, {
      code: input.code,
      financeHandoff: result.financeHandoff,
      journalsPosted: false,
    }),
  );
}

export async function acceptSyncEnvelope(
  input: {
    tenantId: string;
    envelopeId: string;
    deviceId?: string;
    operation: string;
    payload: Record<string, unknown>;
    clientOccurredAt: string;
  },
  actor?: AgriActor,
) {
  const [existing] = await db
    .select()
    .from(s.syncEnvelopes)
    .where(and(eq(s.syncEnvelopes.tenantId, input.tenantId), eq(s.syncEnvelopes.envelopeId, input.envelopeId)))
    .limit(1);
  if (existing) {
    return { id: existing.id, status: existing.status, replay: true as const };
  }
  const id = agriId();
  await db.insert(s.syncEnvelopes).values({
    id,
    tenantId: input.tenantId,
    envelopeId: input.envelopeId,
    deviceId: input.deviceId,
    operation: input.operation,
    payload: input.payload,
    clientOccurredAt: new Date(input.clientOccurredAt),
    status: "ACCEPTED",
    actorUserId: actor?.userId,
  });
  return { id, status: "ACCEPTED" as const, replay: false as const };
}

export async function runWhatIf(
  input: {
    tenantId: string;
    farmId?: string;
    title: string;
    areaHa?: number;
    yieldKgPerHa?: number;
    rainfallMm?: number;
  },
  actor?: AgriActor,
) {
  assertActorTenant(actor, input.tenantId);
  if (input.farmId) {
    const farm = await getFarm(input.farmId, input.tenantId);
    if (!farm) throw new AgriDomainError("NOT_FOUND", "Farm not found");
  }
  const area = input.areaHa ?? 0;
  const yld = input.yieldKgPerHa ?? 0;
  const rainfall = input.rainfallMm ?? 0;
  const outlookKg = area * yld * (rainfall > 0 ? Math.min(1.2, 0.7 + rainfall / 1000) : 1);
  const explanation =
    "SIMULATION only. Derived from caller-supplied area, yield-per-hectare and optional rainfall. Not a forecast, not financial truth, not a harvest.";
  const id = agriId();
  const outputs = { outlookKg, basis: "SIMULATION", journalsPosted: false };
  await db.insert(s.whatIfRuns).values({
    id,
    tenantId: input.tenantId,
    farmId: input.farmId,
    title: input.title,
    basis: "SIMULATION",
    inputs: { areaHa: area, yieldKgPerHa: yld, rainfallMm: rainfall },
    outputs,
    explanation,
    actorUserId: actor?.userId,
  });
  return { id, outputs, explanation, epistemicStatus: "SCENARIO" as const };
}

export async function agricultureDashboard(tenantId: string) {
  const [[farms], [cycles], [harvestRows], [herds], [work], [hazards], [cases]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(s.farms).where(eq(s.farms.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.cropCycles).where(eq(s.cropCycles.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.harvests).where(eq(s.harvests.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.livestockHerds).where(eq(s.livestockHerds.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.workOrders).where(eq(s.workOrders.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.hazardRegister).where(eq(s.hazardRegister.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.capitalCases).where(eq(s.capitalCases.tenantId, tenantId)),
  ]);
  return {
    farms: farms?.n ?? 0,
    cropCycles: cycles?.n ?? 0,
    harvests: harvestRows?.n ?? 0,
    herds: herds?.n ?? 0,
    workOrders: work?.n ?? 0,
    hazards: hazards?.n ?? 0,
    capitalCases: cases?.n ?? 0,
    financeBoundary: {
      journals: "FINANCE_OS_ONLY",
      capPosting: "LOCKED",
      harvestEvent: "HARVEST_RECORDED",
    },
    timezoneDefault: "Africa/Dar_es_Salaam",
    countryDefault: "TZ",
  };
}

export async function observeAgriculture(tenantId: string) {
  const dash = await agricultureDashboard(tenantId);
  return dash;
}
