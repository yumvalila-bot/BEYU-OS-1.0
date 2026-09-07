/**
 * BEYU OS — Agriculture OS domain logic
 *
 * STATUS: SCAFFOLDED (core operations only)
 *
 * Provides foundational agriculture operations: farm management, crop cycle
 * tracking, harvest recording, and livestock herd management.
 *
 * Authority boundaries:
 * - Agriculture OS owns agricultural operations (this module)
 * - Finance OS owns financial consequences (costs, revenue, ledger)
 * - BEYU OS owns identity, authorization, governance
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { fixedId, ID_PREFIX } from "@/lib/ids";

// ============================================================================
// TYPES
// ============================================================================

export interface CreateFarmInput {
  tenantId: string;
  legalEntityId: string;
  code: string;
  name: string;
  countryCode: string;
  totalAreaHa?: string;
  arableAreaHa?: string;
  soilType?: string;
  waterSource?: string;
}

export interface CreateCropCycleInput {
  tenantId: string;
  fieldId: string;
  cropTypeId: string;
  code: string;
  season: string;
  plantingDate: string;
  expectedHarvestDate?: string;
  seedQuantityKg?: string;
  expectedYieldKg?: string;
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

// ============================================================================
// FARM OPERATIONS
// ============================================================================

export async function createFarm(input: CreateFarmInput) {
  const id = fixedId(ID_PREFIX.tenant, `FARM_${input.code}`);
  await db.insert(s.farms).values({
    id,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    code: input.code,
    name: input.name,
    countryCode: input.countryCode,
    totalAreaHa: input.totalAreaHa,
    arableAreaHa: input.arableAreaHa,
    soilType: input.soilType,
    waterSource: input.waterSource,
    status: "ACTIVE",
  });
  return { id };
}

export async function getFarm(farmId: string, tenantId: string) {
  const [farm] = await db
    .select()
    .from(s.farms)
    .where(and(eq(s.farms.id, farmId), eq(s.farms.tenantId, tenantId)));
  return farm ?? null;
}

export async function listFarms(tenantId: string) {
  return db.select().from(s.farms).where(eq(s.farms.tenantId, tenantId));
}

// ============================================================================
// CROP CYCLE OPERATIONS
// ============================================================================

export async function createCropCycle(input: CreateCropCycleInput) {
  const id = fixedId(ID_PREFIX.tenant, `CROP_${input.code}`);
  await db.insert(s.cropCycles).values({
    id,
    tenantId: input.tenantId,
    fieldId: input.fieldId,
    cropTypeId: input.cropTypeId,
    code: input.code,
    season: input.season,
    plantingDate: input.plantingDate,
    expectedHarvestDate: input.expectedHarvestDate,
    seedQuantityKg: input.seedQuantityKg,
    expectedYieldKg: input.expectedYieldKg,
    status: "PLANTED",
  });
  return { id };
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
  if (status) {
    conditions.push(eq(s.cropCycles.status, status));
  }
  return db.select().from(s.cropCycles).where(and(...conditions));
}

// ============================================================================
// HARVEST OPERATIONS
// ============================================================================

export async function recordHarvest(input: RecordHarvestInput) {
  const id = fixedId(ID_PREFIX.tenant, `HARV_${input.code}`);

  // Verify crop cycle exists and belongs to tenant
  const cycle = await getCropCycle(input.cropCycleId, input.tenantId);
  if (!cycle) {
    throw new Error("Crop cycle not found");
  }

  // Record harvest
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
  });

  // Update crop cycle actual yield
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

  return { id };
}

// ============================================================================
// LIVESTOCK OPERATIONS
// ============================================================================

export async function recordLivestockEvent(input: RecordLivestockEventInput) {
  const id = fixedId(ID_PREFIX.tenant, `LEVT_${input.herdId}_${Date.now()}`);

  // Verify herd exists and belongs to tenant
  const [herd] = await db
    .select()
    .from(s.livestockHerds)
    .where(and(eq(s.livestockHerds.id, input.herdId), eq(s.livestockHerds.tenantId, input.tenantId)));

  if (!herd) {
    throw new Error("Livestock herd not found");
  }

  // Record event
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

  // Update herd head count
  const newHeadCount = herd.headCount + input.headCount;
  if (newHeadCount < 0) {
    throw new Error("Cannot have negative head count");
  }

  await db
    .update(s.livestockHerds)
    .set({ headCount: newHeadCount })
    .where(eq(s.livestockHerds.id, input.herdId));

  return { id, newHeadCount };
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
  if (farmId) {
    conditions.push(eq(s.livestockHerds.farmId, farmId));
  }
  return db.select().from(s.livestockHerds).where(and(...conditions));
}
